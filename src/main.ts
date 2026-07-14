import './styles/app.css';
import { router, navigate } from './router';
import { adminHome } from './pages/admin';
import { adminGameDetailPage } from './pages/adminGameDetail';
import { publicGamePage } from './pages/publicGame';
import { editRsvpPage } from './pages/editRsvp';
import { errorView, render } from './ui/components';

router
  .add('/', () => navigate('/admin'))
  .add('/admin', () => adminHome())
  .add('/admin/games/:id', (ctx) => adminGameDetailPage(ctx.params.id))
  .add('/game/:slug', (ctx) => publicGamePage(ctx.params.slug))
  .add('/game/:slug/edit/:rsvpId', (ctx) =>
    editRsvpPage(ctx.params.slug, ctx.params.rsvpId, ctx.hashParams.get('token') ?? ''),
  )
  .setNotFound(() => render(errorView('That page does not exist.')))
  .start();
