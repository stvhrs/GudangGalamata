// src/utils/pdfGenerator.js
import { numberFormatter, currencyFormatter, percentFormatter } from './formatters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

export const generateBukuPdfBlob = (dataToExport, headerInfo = {}) => {
    const {
        cvName = "CV. GANGSAR MULIA UTAMA",
        address = "Jl. Kalicari Dalam I No.4, Kalicari, Kec. Pedurungan, Kota Semarang, Jawa Tengah 50198",
        phone = "0882-0069-05391" 
    } = headerInfo;

    // Menggunakan A4 secara eksplisit
    const doc = new jsPDF('p', 'mm', 'a4'); 
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth(); // A4 Width ~ 210mm

    // --- HEADER PDF (KOP SURAT) ---
    // Agar lurus 1 line, font harus dikecilkan menyesuaikan panjang teks
    
    // 1. Nama CV
    doc.setFontSize(12); // Turun dari 14
    doc.setFont('helvetica', 'bold');
    doc.text(cvName, pageWidth / 2, 12, { align: 'center' });

    // 2. Alamat (Kritikal: Dikecilkan agar muat 1 baris)
    doc.setFontSize(7); // Turun drastis dari 9 ke 7 agar tidak wrap
    doc.setFont('helvetica', 'normal');
    // maxWidth memastikan kalaupun kepanjangan, dia akan disusutkan otomatis oleh jsPDF (opsional), 
    // tapi font 7 biasanya cukup untuk alamat standar di A4.
    doc.text(address, pageWidth / 2, 16, { align: 'center', maxWidth: pageWidth - 20 });

    // 3. Telepon
    doc.text(`Telp: ${phone}`, pageWidth / 2, 20, { align: 'center' }); 
    
    // Garis Pemisah
    doc.setLineWidth(0.3);
    doc.line(10, 23, pageWidth - 10, 23); // Margin kiri kanan 10mm
    
    // Judul Dokumen
    doc.setFontSize(10); // Turun dari 11
    doc.setFont('helvetica', 'bold');
    doc.text('Daftar Stok Buku', pageWidth / 2, 29, { align: 'center' });
    
    // --- KOLOM ---
    const tableColumn = [
        "No", "Kode", "Judul Buku", "Penerbit", "Kls", // "Kelas" disingkat "Kls" hemat tempat
        "Stok", "Harga", "Disc", "Peruntukan", "Thn"  // "Diskon"->"Disc", "Tahun"->"Thn"
    ];

    // --- DATA ---
    const tableRows = dataToExport.map((buku, index) => [
        index + 1, 
        buku.id || '-',                      
        buku.nama || buku.judul || '-',       
        buku.penerbit || '-',
        buku.kelas || '-',
        numberFormatter(buku.stok),
        currencyFormatter(buku.harga),        
        percentFormatter(buku.diskon),        
        buku.peruntukan || '-',
        buku.tahun || '-'
    ]);

    // --- PENGATURAN TABEL ---
    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 33, 
        theme: 'grid',
        // Mengurangi margin kiri/kanan agar tabel lebih lebar
        margin: { top: 33, right: 8, left: 8 }, 
        
        // GLOBAL STYLES (Body)
        styles: {
            fontSize: 5,         // SANGAT KECIL (Sebelumnya 6)
            font: 'helvetica',
            overflow: 'linebreak', 
            cellPadding: 1,      // Padding dikurangi (Sebelumnya 1.5)
            valign: 'middle',        
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
        },

        // HEADER TABLE STYLES
        headStyles: { 
            fillColor: [230, 230, 230], 
            textColor: 20, 
            fontStyle: 'bold', 
            halign: 'center', 
            valign: 'middle',
            fontSize: 6,         // Header font 6 (Sebelumnya 7)
            cellPadding: 1.5     // Sedikit lebih longgar dari body
        },

        // BODY STYLES
        bodyStyles: { 
            textColor: 50,
        },

        alternateRowStyles: {
            fillColor: [250, 250, 250] 
        },

        // LEBAR KOLOM (Optimasi Ketat)
        // Total width A4 (210) - Margin (16) = 194mm area kerja
        columnStyles: { 
            0: { cellWidth: 6,  halign: 'center' }, // No
            1: { cellWidth: 10, halign: 'left' },   // Kode
            2: { cellWidth: 'auto', halign: 'left' }, // Judul (Mengambil sisa ruang)
            3: { cellWidth: 14, halign: 'left' },   // Penerbit
            4: { cellWidth: 6,  halign: 'center' }, // Kelas
            5: { cellWidth: 8,  halign: 'right' },  // Stok
            6: { cellWidth: 15, halign: 'right' },  // Harga
            7: { cellWidth: 8,  halign: 'center' }, // Disc
            8: { cellWidth: 12, halign: 'left' },   // Peruntukan
            9: { cellWidth: 8,  halign: 'center' }  // Tahun
        },
    });

    // --- FOOTER ---
    const pageCount = doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : 1; 
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6); // Footer juga dikecilkan
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); 
        const printDate = `Dicetak: ${new Date().toLocaleString('id-ID')}`;
        const pageNumText = `Hal ${i} dari ${pageCount}`;
        doc.text(printDate, 10, pageHeight - 8);
        doc.text(pageNumText, pageWidth - 10 - doc.getTextWidth(pageNumText), pageHeight - 8);
    }

    return doc.output('blob'); 
};