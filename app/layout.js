import './style.css';

export const metadata = {
  title: 'SpeakMate AI — Speaking Studio',
  description: 'Practise real English conversations with an AI speaking partner.'
};

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
