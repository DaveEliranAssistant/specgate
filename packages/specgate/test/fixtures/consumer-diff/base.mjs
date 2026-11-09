import express from 'express';
export const app = express();
app.use(express.json());
function read(req, res) {
 res.status(200).json({ id: 1, title: 'example' });
}
app.get('/tickets/:id', read);
app.post('/tickets', read);
