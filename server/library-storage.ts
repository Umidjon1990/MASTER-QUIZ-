import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { libraryFileBlobs } from "@shared/schema";

function envFrom(source: NodeJS.ProcessEnv, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveLibraryS3Config(source: NodeJS.ProcessEnv) {
  const bucketName = envFrom(source, "LIBRARY_BUCKET_NAME", "BUCKET_NAME", "BUCKET");
  const endpointRaw = envFrom(source, "LIBRARY_S3_ENDPOINT", "AWS_ENDPOINT_URL_S3", "ENDPOINT");
  const accessKeyId = envFrom(source, "LIBRARY_S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID");
  const secretAccessKey = envFrom(source, "LIBRARY_S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY");
  const region = envFrom(source, "LIBRARY_S3_REGION", "AWS_REGION", "REGION") || "auto";
  return { bucketName, endpointRaw, accessKeyId, secretAccessKey, region, enabled: !!(bucketName && endpointRaw && accessKeyId && secretAccessKey) };
}

const { bucketName, endpointRaw, accessKeyId, secretAccessKey, region, enabled: hasS3 } = resolveLibraryS3Config(process.env);
const forcePathStyle = process.env.LIBRARY_S3_FORCE_PATH_STYLE === "true";
const encryptionMagic = Buffer.from("MQLIB1", "ascii");

function loadEncryptionKey(): Buffer | null {
  const configured = process.env.LIBRARY_ENCRYPTION_KEY?.trim();
  if (configured) {
    const key = /^[a-f\d]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("LIBRARY_ENCRYPTION_KEY must contain exactly 32 bytes");
    return key;
  }
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret) return createHash("sha256").update(sessionSecret).digest();
  if (process.env.NODE_ENV !== "production") return createHash("sha256").update("master-quiz-local-library-key").digest();
  return null;
}

const encryptionKey = loadEncryptionKey();

function encrypt(content: Buffer): Buffer {
  if (!encryptionKey) throw new Error("Library encryption key is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return Buffer.concat([encryptionMagic, iv, cipher.getAuthTag(), encrypted]);
}

function decrypt(content: Buffer): Buffer {
  if (!encryptionKey) throw new Error("Library encryption key is not configured");
  if (!content.subarray(0, encryptionMagic.length).equals(encryptionMagic)) throw new Error("Invalid encrypted library object");
  const ivStart = encryptionMagic.length;
  const iv = content.subarray(ivStart, ivStart + 12);
  const tag = content.subarray(ivStart + 12, ivStart + 28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content.subarray(ivStart + 28)), decipher.final()]);
}

const s3 = hasS3 ? new S3Client({
  region,
  endpoint: endpointRaw!.startsWith("http") ? endpointRaw : `https://${endpointRaw}`,
  forcePathStyle,
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
}) : null;

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) throw new Error("Storage returned an empty file");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function assertEncryptionReady() {
  if (!encryptionKey) throw new Error("Library encryption key is not configured");
}

async function getPostgresObject(key: string): Promise<Buffer | null> {
  const [row] = await db.select({ content: libraryFileBlobs.encryptedContent })
    .from(libraryFileBlobs)
    .where(eq(libraryFileBlobs.storageKey, key));
  return row?.content ? Buffer.from(row.content) : null;
}

function isMissingS3Object(error: any): boolean {
  return error?.name === "NoSuchKey" || error?.Code === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

export const libraryFileStorage = {
  configured: !!encryptionKey,
  provider: hasS3 ? "private-s3" : "postgresql-encrypted",

  async put(key: string, content: Buffer): Promise<void> {
    assertEncryptionReady();
    const protectedContent = encrypt(content);
    if (s3) {
      await s3.send(new PutObjectCommand({
        Bucket: bucketName!,
        Key: key,
        Body: protectedContent,
        ContentType: "application/octet-stream",
        CacheControl: "private, no-store, max-age=0",
        Metadata: { classification: "confidential-library-source" },
      }));
      return;
    }
    await db.insert(libraryFileBlobs).values({
      storageKey: key,
      encryptedContent: protectedContent,
      encryptedSize: protectedContent.length,
    }).onConflictDoUpdate({
      target: libraryFileBlobs.storageKey,
      set: {
        encryptedContent: protectedContent,
        encryptedSize: protectedContent.length,
        updatedAt: new Date(),
      },
    });
  },

  async get(key: string): Promise<Buffer> {
    assertEncryptionReady();
    if (s3) {
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: bucketName!, Key: key }));
        return decrypt(await streamToBuffer(result.Body));
      } catch (error) {
        if (!isMissingS3Object(error)) throw error;
      }
    }
    const protectedContent = await getPostgresObject(key);
    if (!protectedContent) throw new Error("Library file was not found in private storage");
    return decrypt(protectedContent);
  },

  async remove(key: string): Promise<void> {
    assertEncryptionReady();
    if (s3) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucketName!, Key: key }));
      } catch (error) {
        if (!isMissingS3Object(error)) throw error;
      }
    }
    await db.delete(libraryFileBlobs).where(eq(libraryFileBlobs.storageKey, key));
  },
};
