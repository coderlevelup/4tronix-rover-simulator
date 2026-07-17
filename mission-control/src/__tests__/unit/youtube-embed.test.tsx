/**
 * @jest-environment jsdom
 *
 * Unit tests for the click-to-play YouTube facade.
 *
 * The iframe must not exist until the learner taps play (eager embeds from a
 * shared venue IP trigger YouTube's bot detection), the player must use the
 * privacy-enhanced youtube-nocookie.com domain, and the Watch-on-YouTube
 * escape hatch must always be present since a blocked embed cannot be
 * detected or recovered from inside the iframe.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { YouTubeEmbed } from '@/components/mission/YouTubeEmbed';

const ID = 'dQw4w9WgXcQ';

describe('YouTubeEmbed', () => {
  it('renders the thumbnail facade with no iframe until played', () => {
    const { container } = render(<YouTubeEmbed youtubeId={ID} title="Sand Observer run" />);

    expect(container.querySelector('iframe')).not.toBeInTheDocument();

    const thumb = container.querySelector('img');
    expect(thumb).toHaveAttribute('src', `https://img.youtube.com/vi/${ID}/hqdefault.jpg`);

    expect(screen.getByRole('button', { name: /play video: sand observer run/i })).toBeInTheDocument();
  });

  it('creates the privacy-enhanced iframe with autoplay after tapping play', () => {
    const { container } = render(<YouTubeEmbed youtubeId={ID} title="Sand Observer run" />);

    fireEvent.click(screen.getByRole('button', { name: /play video/i }));

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0&autoplay=1`
    );
    // The facade button is gone once the player is live
    expect(screen.queryByRole('button', { name: /play video/i })).not.toBeInTheDocument();
  });

  it('always offers the Watch on YouTube escape hatch in a new tab', () => {
    render(<YouTubeEmbed youtubeId={ID} title="Sand Observer run" />);

    const link = screen.getByRole('link', { name: /watch on youtube/i });
    expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${ID}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
