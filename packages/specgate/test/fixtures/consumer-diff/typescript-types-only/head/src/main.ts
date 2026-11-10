import express from 'express';
import routes from './routes';

const app = express();
app.use(express.json());
app.use(routes);

app.get('/', (req: express.Request, res: express.Response) => {
  res.json({ status: 'up' });
});

export default app;
