import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import aiRouter from './routes/ai';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || '*',
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/ai', aiRouter);

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
