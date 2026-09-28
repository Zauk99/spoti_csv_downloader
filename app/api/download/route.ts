import { NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

interface Track {
  title: string;
  artist: string;
}

export async function POST(req: NextRequest) {
  try {
    const { folderName, tracks } = await req.json() as { folderName: string; tracks: Track[] };

    if (!folderName || !tracks || tracks.length === 0) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });
    }

    const safeFolderName = folderName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputDir = path.join(process.cwd(), 'downloads', safeFolderName);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let completed = 0;
        const total = tracks.length;

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          const query = `${track.title} ${track.artist}`;
          const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

          sendEvent({
            type: 'progress',
            current: i + 1,
            total,
            trackName: `${track.title} - ${track.artist}`
          });

          // Comando con extractor-args para simular el cliente de Android/iOS y evitar el 403
          const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 --embed-thumbnail --add-metadata --extractor-args "youtube:player_client=android,web" -o "${outputTemplate}" "ytsearch1:${query.replace(/"/g, '')}"`;

          try {
            await execAsync(command);
            completed++;
          } catch (err) {
            console.error(`Error descargando "${query}":`, err);
          }
        }

        // Generar playlist.json
        const playlistJsonPath = path.join(outputDir, 'playlist.json');
        fs.writeFileSync(playlistJsonPath, JSON.stringify({
          name: safeFolderName,
          createdAt: new Date().toISOString(),
          tracksCount: tracks.length,
          tracks
        }, null, 2));

        sendEvent({
          type: 'complete',
          message: `Descarga finalizada: ${completed}/${total} canciones procesadas.`,
          path: outputDir
        });

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error en el servidor' }), { status: 500 });
  }
}