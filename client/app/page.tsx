'use client';

import { useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const [status, setStatus] = useState('Checking API connection...');

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json() as Promise<{ status: string }>;
      })
      .then((data) => setStatus(`API ${data.status}`))
      .catch(() => setStatus('API unavailable'));
  }, []);

  return (
    <main>
      <p className="eyebrow">MEDATLAS / FOUNDATION</p>
      <h1>Clinical knowledge, mapped clearly.</h1>
      <p className="intro">Next.js client and Express API are ready for product development.</p>
      <div className="status" role="status">
        <span aria-hidden="true" />
        {status}
      </div>
    </main>
  );
}
