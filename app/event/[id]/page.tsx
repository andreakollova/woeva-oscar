import { createClient } from '@supabase/supabase-js';
import EventClientPage from './EventClientPage';

function getDb() { return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!); }

export default async function EventPage({ params }: { params: { id: string } }) {
  const { data: event } = await getDb()
    .from('events')
    .select('id, title, date, time, venue, city, cover_url, price, is_free, description')
    .eq('id', params.id)
    .single();

  return <EventClientPage event={event} id={params.id} />;
}
