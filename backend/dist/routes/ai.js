"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiAdvisor_1 = require("../services/aiAdvisor");
const router = (0, express_1.Router)();
router.post('/analyze', async (req, res) => {
    const { mode = 'amable', summary, action } = req.body;
    try {
        const message = await (0, aiAdvisor_1.analyzeSummary)({
            mode,
            summary,
            action,
        });
        res.json({ message });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No pudimos generar recomendaciones en este momento.' });
    }
});
router.post('/parse-transaction', async (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Falta el texto a interpretar.' });
    }
    try {
        const parsed = await (0, aiAdvisor_1.parseTransactionText)(text);
        res.json(parsed);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No pudimos interpretar el texto en este momento.' });
    }
});
exports.default = router;
//# sourceMappingURL=ai.js.map