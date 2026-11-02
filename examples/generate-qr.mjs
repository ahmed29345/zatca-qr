// Generates and decodes a ZATCA QR payload for a simplified tax invoice.
//
// Run from the repository root:  npm run example
// (The import below resolves to this package's own build output in dist/.)

import { decodeQr, encodeQr, ZatcaQrError } from '@ahmed29345/zatca-qr';

const subtotal = 100; // SAR, before VAT
const vat = 15; // 15% standard rate

const payload = encodeQr({
  sellerName: 'شركة المثال للتجارة', // "Example Trading Company"
  vatNumber: '399999999900003',
  timestamp: new Date(Date.UTC(2026, 0, 31, 11, 5, 0)), // written as 2026-01-31T11:05:00Z
  invoiceTotal: subtotal + vat, // 115 -> "115.00"
  vatTotal: vat, // 15 -> "15.00"
});

console.log('QR payload (Base64):');
console.log(payload);
console.log();
console.log('Decoded:');
console.log(decodeQr(payload));

// Invalid input fails with a typed error you can branch on.
try {
  encodeQr({
    sellerName: 'Example Store',
    vatNumber: '123456789',
    timestamp: '2026-01-31T11:05:00Z',
    invoiceTotal: '115.00',
    vatTotal: '15.00',
  });
} catch (error) {
  if (error instanceof ZatcaQrError) {
    console.log();
    console.log(`Rejected with ${error.code}: ${error.message}`);
  } else {
    throw error;
  }
}

// To render the payload as an image, pass the Base64 string, unchanged, as the
// QR code's text to any QR library. For example, with the `qrcode` package:
//
//   import QRCode from 'qrcode';
//   await QRCode.toFile('invoice-qr.png', payload, { errorCorrectionLevel: 'M' });
//
// In a browser:
//
//   const dataUrl = await QRCode.toDataURL(payload);
//   document.querySelector('img#invoice-qr').src = dataUrl;
