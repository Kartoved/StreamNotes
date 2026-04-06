// @vitest-environment happy-dom

/**
 * AttachmentDisplay UI tests (src/editor/TiptapViewer.tsx — AttachmentDisplay)
 *
 * AttachmentDisplay is the read-only attachment renderer used by TiptapViewer.
 * It resolves an `attachment://` URL via OPFS async API, then renders
 * differently for images, videos, and generic files.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock OPFS resolver ─────────────────────────────────────────────────
// resolveUrl is async and depends on navigator.storage (OPFS) — swap it for
// a simple Promise so we control the resolved/rejected outcome per test.

const mockResolveUrl = vi.fn<[string], Promise<string>>();

vi.mock('../../utils/opfsFiles', () => ({
  resolveUrl: (src: string) => mockResolveUrl(src),
  getFileType: (src: string) => {
    const ext = src.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
    return 'file';
  },
  formatSize: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },
}));

// ── Mock Lightbox (portal-based) ───────────────────────────────────────
vi.mock('../../editor/components/Lightbox', () => ({
  Lightbox: ({ name, onClose }: { url: string; name: string; onClose: () => void }) => (
    <div data-testid="lightbox">
      <span>{name}</span>
      <button onClick={onClose}>Close lightbox</button>
    </div>
  ),
}));

// ── Component under test ───────────────────────────────────────────────
import { AttachmentDisplay } from '../../editor/TiptapViewer';

// ── Helpers ────────────────────────────────────────────────────────────
function renderAttachment(overrides: Partial<React.ComponentProps<typeof AttachmentDisplay>> = {}) {
  const defaults: React.ComponentProps<typeof AttachmentDisplay> = {
    src: 'attachment://abc123.pdf',
    name: 'document.pdf',
    fileType: 'file',
    size: 102400, // 100 KB
    ...overrides,
  };
  return render(<AttachmentDisplay {...defaults} />);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AttachmentDisplay — loading state', () => {
  beforeEach(() => {
    // Never resolves during the test → stays in loading state
    mockResolveUrl.mockReturnValue(new Promise(() => {}));
  });

  it('shows filename with ellipsis while URL is resolving', () => {
    renderAttachment({ name: 'report.pdf' });
    expect(screen.getByText(/report\.pdf\.\.\./)).toBeInTheDocument();
  });

  it('does not show download link yet', () => {
    renderAttachment();
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument();
  });
});

describe('AttachmentDisplay — error state', () => {
  beforeEach(() => {
    mockResolveUrl.mockRejectedValue(new Error('File not found'));
  });

  it('shows error message with filename after rejection', async () => {
    renderAttachment({ name: 'missing.zip' });
    await waitFor(() => {
      expect(screen.getByText(/missing\.zip/)).toBeInTheDocument();
    });
  });

  it('error state element has error styling indicator (⚠)', async () => {
    renderAttachment({ name: 'gone.txt' });
    await waitFor(() => {
      expect(screen.getByText(/⚠/)).toBeInTheDocument();
    });
  });
});

describe('AttachmentDisplay — image rendering', () => {
  const fakeUrl = 'blob:mock/image.jpg';

  beforeEach(() => {
    mockResolveUrl.mockResolvedValue(fakeUrl);
  });

  it('renders an <img> element with the resolved URL', async () => {
    renderAttachment({ fileType: 'image', name: 'photo.jpg' });

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', fakeUrl);
    });
  });

  it('uses the file name as alt text', async () => {
    renderAttachment({ fileType: 'image', name: 'landscape.png' });
    await waitFor(() => {
      expect(screen.getByAltText('landscape.png')).toBeInTheDocument();
    });
  });

  it('shows Lightbox when image is clicked', async () => {
    renderAttachment({ fileType: 'image', name: 'landscape.png' });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('img'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  });

  it('closes Lightbox when its close button is clicked', async () => {
    renderAttachment({ fileType: 'image', name: 'landscape.png' });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('img'));
    fireEvent.click(screen.getByText('Close lightbox'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });

  it('switches to error state when <img> fires onError', async () => {
    renderAttachment({ fileType: 'image', name: 'corrupt.jpg' });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    fireEvent.error(screen.getByRole('img'));
    await waitFor(() => {
      expect(screen.getByText(/⚠/)).toBeInTheDocument();
    });
  });
});

describe('AttachmentDisplay — video rendering', () => {
  beforeEach(() => {
    mockResolveUrl.mockResolvedValue('blob:mock/video.mp4');
  });

  it('renders a <video> element with the resolved src', async () => {
    renderAttachment({ fileType: 'video', name: 'clip.mp4', src: 'attachment://abc.mp4' });

    await waitFor(() => {
      const video = document.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', 'blob:mock/video.mp4');
    });
  });

  it('video element has controls attribute', async () => {
    renderAttachment({ fileType: 'video', name: 'clip.mp4' });
    await waitFor(() => {
      expect(document.querySelector('video')).toHaveAttribute('controls');
    });
  });
});

describe('AttachmentDisplay — generic file rendering', () => {
  const fakeUrl = 'blob:mock/document.pdf';

  beforeEach(() => {
    mockResolveUrl.mockResolvedValue(fakeUrl);
  });

  it('displays the file name', async () => {
    renderAttachment({ name: 'contract.pdf', size: 51200 });
    await waitFor(() => {
      expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    });
  });

  it('displays formatted file size', async () => {
    renderAttachment({ name: 'data.csv', size: 51200 }); // 50 KB
    await waitFor(() => {
      expect(screen.getByText('50.0 KB')).toBeInTheDocument();
    });
  });

  it('displays file size in MB for large files', async () => {
    renderAttachment({ name: 'archive.zip', size: 2 * 1024 * 1024 }); // 2 MB
    await waitFor(() => {
      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });
  });

  it('renders a download link with correct href and download attributes', async () => {
    renderAttachment({ name: 'invoice.pdf' });
    await waitFor(() => {
      const link = screen.getByTitle('Download') as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', fakeUrl);
      expect(link).toHaveAttribute('download', 'invoice.pdf');
    });
  });
});

describe('AttachmentDisplay — edge cases', () => {
  beforeEach(() => {
    mockResolveUrl.mockResolvedValue('blob:mock/file.bin');
  });

  it('handles empty file name without crashing', async () => {
    expect(() => renderAttachment({ name: '' })).not.toThrow();
  });

  it('handles zero-byte file size', async () => {
    renderAttachment({ name: 'empty.txt', size: 0 });
    await waitFor(() => {
      expect(screen.getByText('0 B')).toBeInTheDocument();
    });
  });

  it('renders extremely long file name (overflow handled by CSS)', async () => {
    const longName = 'a'.repeat(300) + '.pdf';
    renderAttachment({ name: longName, fileType: 'file' });
    await waitFor(() => {
      // The name element has overflow: hidden / textOverflow: ellipsis applied via inline style
      const nameEl = screen.getByText(longName);
      expect(nameEl).toBeInTheDocument();
      expect(nameEl).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis' });
    });
  });

  it('renders correctly inside a grid (inGrid=true removes margin)', async () => {
    renderAttachment({ fileType: 'image', name: 'thumb.jpg', inGrid: true });
    await waitFor(() => {
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      // In grid mode the img uses objectFit: cover and maxHeight: 140px
      expect(img).toHaveStyle({ maxHeight: '140px', objectFit: 'cover' });
    });
  });
});

describe('AttachmentDisplay — accessibility', () => {
  beforeEach(() => {
    mockResolveUrl.mockResolvedValue('blob:mock/file');
  });

  it('download anchor has title "Download"', async () => {
    renderAttachment({ name: 'report.pdf' });
    await waitFor(() => {
      expect(screen.getByTitle('Download')).toBeInTheDocument();
    });
  });

  it('image has meaningful alt text from file name', async () => {
    renderAttachment({ fileType: 'image', name: 'diagram.png' });
    await waitFor(() => {
      expect(screen.getByAltText('diagram.png')).toBeInTheDocument();
    });
  });
});
