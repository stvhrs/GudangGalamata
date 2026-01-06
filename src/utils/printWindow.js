// src/utils/printWindow.js

/**
 * Fungsi global untuk mencetak konten HTML raw.
 * @param {string} content - String HTML yang ingin dicetak
 * @param {string} title - Judul tab/jendela print (default: 'Print Document')
 */
export const printRawHtml = (content, title = 'Print Document') => {
    if (!content) return;

    // Buka jendela baru
    const printWindow = window.open('', '_blank', 'width=900,height=600');

    // Cek jika popup diblokir browser
    if (!printWindow) {
        alert("Pop-up terblokir! Izinkan pop-up untuk mencetak.");
        return;
    }

    const style = `
        <style>
            @page {
                size: auto; 
                margin: 0; 
            }

            html, body {
                margin: 0;
                padding: 0;
                width: 100%;
            }

            body {
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                line-height: 1.0; 

                /* --- ZONA AMAN ATAS (SAFETY MARGIN) --- */
                padding-top: 10mm; 
                padding-left: 0; 
                padding-right: 0;
            }

            #print-container {
                white-space: pre; 

                /* --- TEKNIK CENTERING --- */
                width: fit-content; 
                margin-left: auto;
                margin-right: auto;
            }

            @media print {
                body { -webkit-print-color-adjust: exact; }
            }
        </style>
    `;

    printWindow.document.write(`
        <html>
          <head>
            <title>${title}</title>
            ${style}
          </head>
          <body>
            <div id="print-container">${content}</div>
          </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Timeout agar CSS sempat merender sebelum dialog print muncul
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
};