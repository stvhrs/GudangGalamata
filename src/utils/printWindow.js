// src/utils/printWindow.js

/**
 * Mencetak HTML Generator ke Jendela Baru (Optimized for Epson LX-310)
 */
export const printRawHtml = (content, title = 'Print Document') => {
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=1000,height=800');

    if (!printWindow) {
        alert("Pop-up terblokir! Izinkan pop-up pada browser untuk mencetak.");
        return;
    }

    const css = `
        <style>
            @page {
                margin: 0;
                size: auto; 
            }
            
            body {
                margin: 0;
                /* PENTING: Font Monospace agar karakter sejajar & tajam di LX-310 */
                font-family: 'Consolas', Courier, monospace; 
                font-size: 13px; 
                color: #000;
                background-color: #fff;
            }

            .sheet {
                padding: 5mm;
                width: 100%;
                box-sizing: border-box;
            }

            /* Utilities Typography */
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }

            /* TABLE STYLING - TANPA WARNA BACKGROUND */
            table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed; /* Mencegah kolom bergeser */
            }

            td, th {
                padding: 3px 5px; /* Padding kecil agar muat banyak */
                vertical-align: top;
                word-wrap: break-word;
            }

            /* BORDER CLASSIC - STYLE DOT MATRIX */
            .table-bordered th, 
            .table-bordered td {
                border: 1px solid #000;
            }

            /* Header Table Style (Opsional: Border atas/bawah saja biar bersih) */
            .table-bordered th {
                border-bottom: 2px solid #000; /* Garis lebih tebal untuk header */
                font-weight: bold;
            }

            /* CSS RESET KHUSUS PRINT */
            @media print {
                * {
                    -webkit-print-color-adjust: exact;
                    color: #000 !important;        /* Paksa hitam */
                    background: transparent !important; /* Paksa transparan */
                    box-shadow: none !important;
                    text-shadow: none !important;
                }
                
                body {
                    padding: 0;
                }

                /* Sembunyikan elemen browser default */
                @page { margin: 0; }
            }
        </style>
    `;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            ${css}
          </head>
          <body>
            <section class="sheet">
                ${content}
            </section>
          </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
};