'use client';

/**
 * Click-to-play YouTube embed.
 *
 * The iframe is only created after the learner taps play. Three reliability
 * wins over an eager embed:
 * - Pages full of eager embeds from one venue IP (500 kids on shared wifi)
 *   look like bot traffic to Google and trigger "unusual traffic" blocks.
 *   Click-to-play means embeds load only on intent.
 * - The preview thumbnail comes from img.youtube.com, a separate pipeline
 *   that is practically never bot-gated, so the page always renders.
 * - The block page cannot be detected from our side (it loads "successfully"
 *   cross-origin and a captcha cannot be solved inside an embed), so a
 *   visible Watch-on-YouTube link is the escape hatch: the real site or app
 *   can pass the check.
 *
 * Uses the youtube-nocookie.com privacy-enhanced player, the right default
 * for an audience of minors.
 */

import React, { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';

interface YouTubeEmbedProps {
  youtubeId: string;
  title: string;
}

export function YouTubeEmbed({ youtubeId, title }: YouTubeEmbedProps) {
  const [playing, setPlaying] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&autoplay=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 h-full w-full cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed img.youtube.com host; a plain img keeps the facade dependency-free */}
            <img
              src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/10">
              <span className="clay flex h-14 w-14 items-center justify-center rounded-full bg-gradient-mars text-primary-foreground transition-transform group-hover:scale-110">
                <Play className="ml-0.5 h-6 w-6 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 self-end text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        Watch on YouTube
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
