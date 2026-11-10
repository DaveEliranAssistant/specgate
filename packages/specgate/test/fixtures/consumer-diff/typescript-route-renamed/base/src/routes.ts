import { Router } from 'express';
import notesController from './notes/notes.controller';
import usersController from './users/users.controller';

const api = Router().use(notesController).use(usersController);

export default Router().use('/api', api);
