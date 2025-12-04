type AdvisorMode = 'amable' | 'regañon' | 'directo' | 'exigente';
interface SpendingSummary {
    month?: string;
    totalExpense?: number;
    totalIncome?: number;
    topCategories?: {
        category: string;
        amount: number;
    }[];
    budget?: number;
    lastTransactions?: {
        amount: number;
        category: string;
        type: 'expense' | 'income';
        date: string;
        note?: string;
    }[];
    previousMonthExpense?: number;
    previousMonthIncome?: number;
}
interface AnalyzeInput {
    mode: AdvisorMode;
    summary?: SpendingSummary;
    action?: string;
}
interface ParsedTransaction {
    amount: number;
    category: string;
    note?: string;
    paymentMethod: 'efectivo' | 'debito' | 'credito' | 'digital' | 'otro';
    type: 'expense' | 'income';
    date: string;
    confidence?: number;
    rawText?: string;
}
export declare function analyzeSummary({ mode, summary, action }: AnalyzeInput): Promise<string>;
export declare function parseTransactionText(text: string): Promise<ParsedTransaction>;
export {};
//# sourceMappingURL=aiAdvisor.d.ts.map