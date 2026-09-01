import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

const bucketName = env("LIBRARY_BUCKET_NAME", "BUCKET_NAME", "BUCKET");
const endpointRaw = env("LIBRARY_S3_ENDPOINT", "AWS_ENDPOINT_URL_S3", "ENDPOINT");
const accessKeyId = env("LIBRARY_S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID");
const secretAccessKey = env("LIBRARY_S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY");
const region = env("LIBRARY_S3_REGION", "AWS_REGION", "REGION") || "auto";
const forcePathStyle = process.env.LIBRARY_S3_FORCE_PATH_STYLE === "true";
const hasS3 = !!(bucketName && endpointRaw && accessKeyId && secretAccessKey);
const localRoot = path.resolve(process.env.LIBRARY_LOCAL_STORAGE_DIR || ".library-private");
const encryptionMagic = Buffer.from("MQLIB1", "ascii");

function loadEncryptionKey(): Buffer | null {
  const configured = process.env.LIBRARY_ENCRYPTION_KEY?.trim();
  if (configured) {
    const key = /^[a-f\d]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("LIBRARY_ENCRYPTION_KEY must contain exactly 32 bytes");
    return key;
  }
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256").update(process.env.SESSION_SECRET || "master-quiz-local-library-key").digest();
  }
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

function assertProductionStorage() {
  if (!hasS3 && process.env.NODE_ENV === "production") {
    throw new Error("Private library bucket is not configured");
  }
  if (!encryptionKey) throw new Error("Library encryption key is not configured");
}

export const libraryFileStorage = {
  configured: (hasS3 && !!encryptionKey) || process.env.NODE_ENV !== "production",
  provider: hasS3 ? "private-s3" : "local-development",

  async put(key: string, content: Buffer): Promise<void> {
    assertProductionStorage();
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
    const target = path.join(localRoot, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, protectedContent, { mode: 0o600 });
  },

  async get(key: string): Promise<Buffer> {
    assertProductionStorage();
    if (s3) {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucketName!, Key: key }));
      return decrypt(await streamToBuffer(result.Body));
    }
    return decrypt(await fs.readFile(path.join(localRoot, key)));
  },

  async remove(key: string): Promise<void> {
    assertProductionStorage();
    if (s3) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName!, Key: key }));
      return;
    }
    await fs.unlink(path.join(localRoot, key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
};
