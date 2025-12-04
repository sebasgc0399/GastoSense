import { Router } from 'express';
import { analyzeSummary, parseTransactionText } from '../services/aiAdvisor';

const router = Router();

router.post('/analyze', async (req, res) => {
  const { mode = 'amable', summary, action } = req.body;

  try {
    const message = await analyzeSummary({
      mode,
      summary,
      action,
    });
    res.json({ message });
  } catch (error) {
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
    const parsed = await parseTransactionText(text);
    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No pudimos interpretar el texto en este momento.' });
  }
});

export default router;
