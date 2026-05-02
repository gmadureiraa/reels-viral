'use client';

import Script from 'next/script';

interface MetaPixelProps {
  pixelId: string;
}

/**
 * Meta Pixel base tracking. Mounted in app/layout.tsx.
 * Pixel ID is hardcoded per project (one pixel per webapp on Madureira BM).
 *
 * Conversion events (Lead, CompleteRegistration, Subscribe) are wired
 * separately at signup / registration / payment hook points — not here.
 *
 * Reference: BM 704738313932684 (Madureira Cripto), Ad Account 948714981394558.
 */
export function MetaPixel({ pixelId }: MetaPixelProps) {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
