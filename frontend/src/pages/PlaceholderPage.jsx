import { ArrowLeft, ArrowRight, Leaf, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader.jsx';

export function PlaceholderPage({ title, description }) {
  return (
    <div className="standard-page">
      <PageHeader eyebrow="AGRI INTELLIGENCE" title={title} description={description} />
      <section className="coming-soon-card"><div className="coming-soon-card__illustration"><span className="coming-leaf coming-leaf--one"><Leaf size={30} /></span><span className="coming-leaf coming-leaf--two"><Leaf size={22} /></span><span className="coming-soil" /><span className="coming-stem"><Sprout size={78} strokeWidth={1.2} /></span></div><span className="eyebrow">A CLEARER VIEW IS GROWING</span><h2>This space is taking shape.</h2><p>{description} This destination is a placeholder in the frontend foundation milestone; it does not display sample recommendations.</p><Link className="text-link" to="/app/dashboard"><ArrowLeft size={15} /> Back to your dashboard <ArrowRight size={15} /></Link></section>
    </div>
  );
}
