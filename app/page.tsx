'use client';

import { useState } from 'react';
import Papa from 'papaparse';

interface Track {
  title: string;
  artist: string;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [parsedTracks, setParsedTracks] = useState<Track[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number; total: number; track: string }>({
    current: 0,
    total: 0,
    track: ''
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name.replace('.csv', ''));
    setProgress({ current: 0, total: 0, track: '' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const tracks: Track[] = results.data
          .map((row: any) => ({
            title: row['Track Name'] || row['Nombre de la pista'] || '',
            artist: row['Artist Name(s)'] || row['Nombre del artista'] || '',
          }))
          .filter((t) => t.title && t.artist);

        setParsedTracks(tracks);
        setStatus(`CSV cargado: ${tracks.length} canciones encontradas.`);
      },
      error: (err) => {
        setStatus(`Error al leer el CSV: ${err.message}`);
      }
    });
  };

  const handleStartDownload = async () => {
    if (parsedTracks.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: parsedTracks.length, track: 'Iniciando...' });

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderName: fileName,
          tracks: parsedTracks,
        }),
      });

      if (!response.body) throw new Error('No se pudo abrir el stream de descarga');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));

            if (data.type === 'progress') {
              setProgress({
                current: data.current,
                total: data.total,
                track: data.trackName
              });
            } else if (data.type === 'complete') {
              setStatus(`🎉 ${data.message}`);
            }
          }
        }
      }
    } catch (err) {
      setStatus('Ocurrió un error durante la descarga.');
    } finally {
      setLoading(false);
    }
  };

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-2xl font-bold mb-2 text-center text-emerald-400">Spotify CSV to MP3</h1>
        <p className="text-slate-400 text-sm mb-6 text-center">
          Descarga tus canciones organizadas con seguimiento en vivo.
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="file"
            accept=".csv"
            disabled={loading}
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-emerald-500 file:text-slate-950
              hover:file:bg-emerald-400 cursor-pointer disabled:opacity-50"
          />

          {parsedTracks.length > 0 && (
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 mt-2">
              <p className="text-sm font-semibold text-emerald-400">Playlist: {fileName}</p>
              <p className="text-xs text-slate-300 mt-1">{parsedTracks.length} canciones detectadas.</p>

              {loading && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="truncate max-w-[75%]">Descargando: {progress.track}</span>
                    <span>{progress.current}/{progress.total} ({percentage}%)</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleStartDownload}
                disabled={loading}
                className="w-full mt-4 bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {loading ? 'Descargando canciones...' : 'Iniciar Descarga'}
              </button>
            </div>
          )}

          {status && (
            <div className="mt-4 p-3 bg-slate-900 rounded-lg text-xs text-slate-300 font-mono text-center border border-slate-800">
              {status}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}