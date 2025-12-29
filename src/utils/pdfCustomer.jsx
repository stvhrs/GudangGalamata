// src/utils/pdfGenerator.js
import { currencyFormatter } from './formatters'; // Pastikan import formatter benar
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

export const generatePelangganPdfBlob = (dataToExport, headerInfo = {}) => {
    const {
        cvName = "CV. GANGSAR MULIA UTAMA",
        address = "Jl. Kalicari Dalam I No.4, Kalicari, Kec. Pedurungan, Kota Semarang, Jawa Tengah 50198",
        phone = "0882-0069-05391" 
    } = headerInfo;

    const doc = new jsPDF('vertical');
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- HEADER ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(cvName, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(address, pageWidth / 2, 21, { align: 'center' });
    doc.text(`Telp: ${phone}`, pageWidth / 2, 26, { align: 'center' }); 
    doc.setLineWidth(0.3);
    doc.line(14, 29, pageWidth - 14, 29); 
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Laporan Data Pelanggan', pageWidth / 2, 36, { align: 'center' });

    // --- KOLOM ---
    const tableColumn = [
        "No.", "Nama Customer", "Telepon", "Saldo Awal", "Saldo Akhir"
    ];

    // --- DATA ---
    const tableRows = dataToExport.map((cust, index) => [
        index + 1,
        cust.nama || '-',
        cust.telepon || '-',
        currencyFormatter(cust.saldoAwal || 0),
        currencyFormatter(cust.saldoAkhir || 0)
    ]);

    // --- PENGATURAN TABEL ---
    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 42, 
        theme: 'grid', // Theme Grid memberikan border kotak-kotak
        
        // --- 1. ZEBRA STRIPING ---
        // Memberikan warna abu-abu muda pada baris genap/ganjil
        alternateRowStyles: {
            fillColor: [240, 240, 240] 
        },

        styles: {
            fontSize: 8,             
            overflow: 'linebreak',   
            cellPadding: 2,        
            valign: 'middle',        
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },

        headStyles: { 
            fillColor: [50, 50, 50], // Header agak gelap
            textColor: 255, 
            fontStyle: 'bold', 
            halign: 'center', 
            fontSize: 9,             
        },

        columnStyles: { 
            0: { cellWidth: 10, halign: 'center' }, // No.
            1: { cellWidth: 'auto', halign: 'left' }, // Nama
            2: { cellWidth: 30, halign: 'left' },   // Telepon
            3: { cellWidth: 35, halign: 'right' },  // Saldo Awal
            4: { cellWidth: 35, halign: 'right' },  // Saldo Akhir
        },

        // --- 2. LOGIKA WARNA MERAH / HIJAU ---
        // didParseCell dipanggil setelah data sel diproses tapi sebelum digambar
        didParseCell: function (data) {
            // Cek jika sedang di bagian 'body' (bukan header)
            // Dan kolom index 3 (Saldo Awal) atau 4 (Saldo Akhir)
            if (data.section === 'body' && (data.column.index === 3 || data.column.index === 4)) {
                // Ambil text sel (biasanya array string, kita gabung)
                const text = data.cell.text.join('');
                
                // Logika deteksi negatif: ada tanda minus '-' atau kurung '('
                if (text.includes('-') || text.includes('(')) {
                    // WARNA MERAH
                    data.cell.styles.textColor = [220, 53, 69]; 
                    data.cell.styles.fontStyle = 'bold'; // Opsional: Tebalkan minus
                } else {
                    // Cek apakah nilainya Rp 0 atau 0
                    // Kita anggap Rp 0 tetap hitam atau hijau? User minta "Plus Hijau"
                    // Asumsi: Selain negatif adalah hijau (termasuk positif)
                    // WARNA HIJAU
                    data.cell.styles.textColor = [25, 135, 84]; 
                }
            }
        }
    });

    // --- FOOTER ---
    const pageCount = doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : 1; 
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); 
        const printDate = `Dicetak: ${new Date().toLocaleString('id-ID')}`;
        const pageNumText = `Halaman ${i} dari ${pageCount}`;
        doc.text(printDate, 14, pageHeight - 10);
        doc.text(pageNumText, pageWidth - 14 - doc.getTextWidth(pageNumText), pageHeight - 10);
    }

    return doc.output('blob'); 
};