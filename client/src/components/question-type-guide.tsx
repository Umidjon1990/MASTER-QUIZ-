import type { ElementType } from "react";
import {
  BarChart3,
  CheckSquare,
  Languages,
  Link2,
  ListChecks,
  ListOrdered,
  MessageSquare,
  BookOpenText,
  SquarePen,
  ToggleLeft,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "open_ended"
  | "poll"
  | "multiple_select"
  | "translate"
  | "reorder"
  | "match"
  | "fill_blank"
  | "reading";

export type QuestionTypeDefinition = {
  type: QuestionType;
  label: string;
  shortLabel: string;
  description: string;
  icon: ElementType;
  template: string;
  example: string;
};

export const QUESTION_TYPE_DEFINITIONS: QuestionTypeDefinition[] = [
  {
    type: "reading",
    label: "Reading — matn asosida",
    shortLabel: "Reading",
    description: "Bitta matn va unga bog'langan bir yoki bir nechta savol.",
    icon: BookOpenText,
    template: "Reading: [Matn sarlavhasi] | [vaqt, daqiqada]\nMatn:\n[O'qish matnini shu yerga yozing]\nSavollar:\n1. [1-savol]\nA) [1-variant]\nB) [2-variant] *\nC) [3-variant]\nD) [4-variant]\n\n2. [2-savol]\nA) [1-variant] *\nB) [2-variant]\nC) [3-variant]\nD) [4-variant]\n---",
    example: "Reading: Kutubxonadagi kun | 2\nMatn:\nAziza har shanba kuni shahar kutubxonasiga boradi. U tarixiy kitoblarni o'qishni yaxshi ko'radi. Bu hafta u Amir Temur haqidagi kitobni tanladi.\nSavollar:\n1. Aziza kutubxonaga qachon boradi?\nA) Har dushanba\nB) Har shanba *\nC) Har yakshanba\nD) Har juma\n\n2. U bu hafta kim haqidagi kitobni tanladi?\nA) Ibn Sino\nB) Alisher Navoiy\nC) Amir Temur *\nD) Mirzo Ulug'bek\n---",
  },
  {
    type: "multiple_choice",
    label: "Variantli savol",
    shortLabel: "A/B/C/D",
    description: "Bitta to'g'ri javob va 2–4 ta variant.",
    icon: ListChecks,
    template: "1. [Savol matni]\nA) [1-variant]\nB) [2-variant] *\nC) [3-variant]\nD) [4-variant]",
    example: "1. O'zbekiston poytaxti qaysi?\nA) Samarqand\nB) Toshkent *\nC) Buxoro\nD) Namangan",
  },
  {
    type: "true_false",
    label: "To'g'ri / Noto'g'ri",
    shortLabel: "T/N",
    description: "Berilgan fikrning to'g'ri yoki noto'g'riligini tanlash.",
    icon: ToggleLeft,
    template: "To'g'ri/Noto'g'ri: [Tasdiq gap]\nJavob: [To'g'ri yoki Noto'g'ri]",
    example: "To'g'ri/Noto'g'ri: Toshkent O'zbekistonning poytaxti.\nJavob: To'g'ri",
  },
  {
    type: "open_ended",
    label: "Yozma javob",
    shortLabel: "Yozma",
    description: "O'quvchi qisqa javobni o'zi yozadi.",
    icon: MessageSquare,
    template: "Yozma: [Savol matni]\nJavob: [Qabul qilinadigan javob]",
    example: "Yozma: O'zbekistonning poytaxtini yozing.\nJavob: Toshkent",
  },
  {
    type: "poll",
    label: "So'rovnoma",
    shortLabel: "So'rov",
    description: "Fikr yig'ish uchun; to'g'ri javob va ball bo'lmaydi.",
    icon: BarChart3,
    template: "So'rovnoma: [Savol matni]\nA) [1-variant]\nB) [2-variant]\nC) [3-variant]\nD) [4-variant]",
    example: "So'rovnoma: Qaysi usulda o'rganishni yoqtirasiz?\nA) Video\nB) Matn\nC) Amaliy mashq\nD) Guruh bilan",
  },
  {
    type: "multiple_select",
    label: "Ko'p tanlov",
    shortLabel: "Bir nechta",
    description: "Bir nechta variant bir vaqtning o'zida to'g'ri bo'ladi.",
    icon: CheckSquare,
    template: "Ko'p tanlov: [Savol matni]\nA) [To'g'ri variant] *\nB) [Noto'g'ri variant]\nC) [To'g'ri variant] *\nD) [Noto'g'ri variant]",
    example: "Ko'p tanlov: Mevalarni belgilang.\nA) Olma *\nB) Sabzi\nC) Anor *\nD) Kartoshka",
  },
  {
    type: "translate",
    label: "Tarjima",
    shortLabel: "Tarjima",
    description: "So'z yoki gap tarjimasi, bir nechta javob qabul qilinadi.",
    icon: Languages,
    template: "Tarjima: [Tarjima qilinadigan so'z yoki gap]\nJavob: [Asosiy javob]; [qabul qilinadigan boshqa javob]",
    example: "Tarjima: كِتَابٌ\nJavob: kitob; bir kitob",
  },
  {
    type: "reorder",
    label: "So'z tartibi",
    shortLabel: "Tartiblash",
    description: "Aralashtirilgan so'zlardan to'g'ri gap tuzish.",
    icon: ListOrdered,
    template: "Tartib: [So'zlari to'g'ri tartibda yozilgan gap]",
    example: "Tartib: Men har kuni maktabga boraman",
  },
  {
    type: "match",
    label: "Moslashtirish",
    shortLabel: "Juftlash",
    description: "Chap va o'ng tomondagi elementlarni juftlash.",
    icon: Link2,
    template: "Moslash:\n[chap 1] - [o'ng 1]\n[chap 2] - [o'ng 2]\n[chap 3] - [o'ng 3]",
    example: "Moslash:\napple - olma\nbook - kitob\nwater - suv",
  },
  {
    type: "fill_blank",
    label: "Bo'sh o'rinni to'ldirish",
    shortLabel: "To'ldirish",
    description: "Gapdagi ___ o'rniga to'g'ri javobni yozish.",
    icon: SquarePen,
    template: "To'ldirish: [Matnning bo'sh joyiga ___ yozing]\nJavob: [1-bo'shliq javobi]; [2-bo'shliq javobi]",
    example: "To'ldirish: Quyosh ___ dan chiqadi.\nJavob: sharq; sharqdan",
  },
];

export function getQuestionTypeDefinition(type: QuestionType) {
  return QUESTION_TYPE_DEFINITIONS.find((item) => item.type === type)!;
}

export function buildAiQuestionPrompt(type: QuestionType) {
  const definition = getQuestionTypeDefinition(type);
  return `Quyidagi talab asosida ${definition.label.toLowerCase()} yarating. Natijani izohsiz, aynan ko'rsatilgan matn formatida bering. Maydon nomlari va maxsus belgilarni o'zgartirmang. To'g'ri variant yonidagi * belgisini saqlang.\n\nSHABLON:\n${definition.template}\n\nNAMUNA:\n${definition.example}`;
}

export function QuestionTypePicker({
  value,
  onChange,
  compact = false,
}: {
  value: QuestionType;
  onChange: (type: QuestionType) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"} gap-2`}>
      {QUESTION_TYPE_DEFINITIONS.map((definition) => {
        const Icon = definition.icon;
        const selected = definition.type === value;
        return (
          <button
            key={definition.type}
            type="button"
            onClick={() => onChange(definition.type)}
            className={`text-left rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              compact ? "p-2.5" : "p-3"
            } ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-card hover:border-primary/50 hover:bg-muted/40"}`}
            data-testid={`question-type-${definition.type}`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`rounded-md p-2 shrink-0 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5">{definition.label}</span>
                {!compact && <span className="block text-xs text-muted-foreground leading-4 mt-0.5">{definition.description}</span>}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function QuestionTemplateGuide({
  type,
  onCopy,
  onUseExample,
}: {
  type: QuestionType;
  onCopy: () => void;
  onUseExample?: () => void;
}) {
  const definition = getQuestionTypeDefinition(type);
  return (
    <Card className="p-4 border-primary/25 bg-primary/[0.035] space-y-3" data-testid="question-template-guide">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">{definition.label} uchun aniq shablon</p>
          <p className="text-xs text-muted-foreground mt-0.5">Bu formatni AI ham, “Matndan import” tizimi ham tushunadi.</p>
        </div>
        <div className="flex gap-2">
          {onUseExample && (
            <Button type="button" size="sm" variant="outline" onClick={onUseExample}>
              Namunani qo'yish
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={onCopy} data-testid="button-copy-ai-template">
            <Copy className="w-3.5 h-3.5 mr-1.5" /> AI uchun nusxalash
          </Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Bo'sh shablon</p>
          <pre className="whitespace-pre-wrap rounded-md bg-background border p-3 text-xs leading-5 overflow-x-auto" dir="auto">{definition.template}</pre>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">To'ldirilgan namuna</p>
          <pre className="whitespace-pre-wrap rounded-md bg-background border p-3 text-xs leading-5 overflow-x-auto" dir="auto">{definition.example}</pre>
        </div>
      </div>
    </Card>
  );
}
