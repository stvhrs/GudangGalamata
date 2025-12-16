import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA ---
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    // Alamat dihapus sesuai request
};

const baseURL = 'https://gudanggalatama.web.app/';

// --- FUNGSI HELPER ---
const formatNumber = (value) =>
    new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
    }).format(value || 0);

const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

/**
 * Fungsi Build Doc - Portrait A4
 * Support: 'invoice', 'nota', 'payment'
 */
const buildDoc = (transaksi, type) => {
    
    // 1. SETUP KERTAS (PORTRAIT A4)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4' 
    });

    const margin = { top: 15, right: 15, bottom: 15, left: 15 };
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    const isInvoice = type === 'invoice';
    const isPayment = type === 'payment';

    // Tentukan Judul Dokumen
    let title = 'NOTA PEMBAYARAN';
    if (isInvoice) title = 'INVOICE';
    if (isPayment) title = 'BUKTI PEMBAYARAN';

    // Link (Sesuaikan endpoint jika payment)
    const linkSlug = isPayment ? 'payment' : (isInvoice ? 'invoice' : 'nota');
    const link = `${baseURL}${linkSlug}/${transaksi.id}`;

    // Font setting (Helvetica sebagai pengganti Arial)
    const fontName = 'helvetica';
    
    // DEFAULT START BOLD (Untuk Label)
    doc.setFont(fontName, 'bold');

    // --- 2. HEADER DOKUMEN ---
    doc.setFontSize(16);
    // Company Name adalah variable/value -> NORMAL
    doc.setFont(fontName, 'bold'); 
    doc.text(companyInfo.nama, margin.left, currentY,);
    
    doc.setFontSize(12);
    // Title adalah Label Dokumen -> BOLD
    doc.setFont(fontName, 'bold'); 
    doc.text(title, pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 3;

    // Garis Divider Header
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    
    currentY += 8; 

    // --- 3. INFO PELANGGAN & DOKUMEN ---
    const infoRightLabelX = pageWidth - margin.right - 50; 
    const infoRightValueX = pageWidth - margin.right;
    
    let leftY = currentY;
    let rightY = currentY;

    // KIRI: Customer
    doc.setFontSize(9);
    doc.setFont(fontName, 'bold'); // Label
    doc.text('Kepada Yth:', margin.left, leftY); 
    leftY += 4;

    // Value Nama Customer -> NORMAL
    doc.setFont(fontName, 'normal');
    const namaPelanggan = transaksi.namaCustomer || '-'; 
    const splitNama = doc.splitTextToSize(namaPelanggan, 80); 
    doc.text(splitNama, margin.left, leftY);
    leftY += (splitNama.length * 4);
    
    // Tampilkan Keterangan Payment jika ada (di bawah nama)
    if (isPayment && transaksi.keterangan) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        const ket = `Ket: ${transaksi.keterangan}`;
        const splitKet = doc.splitTextToSize(ket, 80);
        doc.text(splitKet, margin.left, leftY + 2);
        leftY += (splitKet.length * 4) + 2;
        doc.setTextColor(0, 0, 0); // Reset Hitam
    }

    doc.setFontSize(9); // Reset size

    // KANAN: No Dokumen & Tanggal
    let noDokumenLabel = 'No. Nota';
    let displayNomor = transaksi.id || '-'; 

    if (isInvoice) {
        noDokumenLabel = 'No. Invoice';
    } else if (isPayment) {
        noDokumenLabel = 'No. Payment';
        displayNomor = transaksi.id || '-';
    } else {
        // Nota Biasa
        displayNomor = displayNomor.replace('INV', 'NT');
    }

    // Label No Dokumen -> BOLD
    doc.setFont(fontName, 'bold');
    doc.text(noDokumenLabel, infoRightLabelX, rightY);
    
    // Value No Dokumen -> NORMAL
    doc.setFont(fontName, 'normal');
    doc.text(displayNomor, infoRightValueX, rightY, { align: 'right' });
    rightY += 5;

    // Label Tanggal -> BOLD
    doc.setFont(fontName, 'bold');
    doc.text('Tanggal', infoRightLabelX, rightY);
    
    // Value Tanggal -> NORMAL
    doc.setFont(fontName, 'normal');
    doc.text(formatDate(transaksi.tanggal), infoRightValueX, rightY, { align: 'right' });
    rightY += 5;

    currentY = Math.max(leftY, rightY) + 6;

    // --- 4. TABEL ITEM ---
    let head = [];
    let body = [];
    let columnStyles = {};

    let totalBuku = 0;
    let subtotalBruto = 0; 
    let subtotalNet = 0; 

    if (isPayment) {
        head = [['No', 'No. Invoice', 'Keterangan', 'Jumlah Bayar']];
        body = (transaksi.items || []).map((item, i) => {
            const amount = Number(item.amount || 0);
            return [
                i + 1, 
                item.invoiceId || '-', 
                'Pembayaran Invoice', 
                formatNumber(amount)
            ];
        });

        columnStyles = {
            0: { halign: 'center', cellWidth: 10 }, 
            1: { halign: 'left', cellWidth: 50 }, 
            2: { halign: 'left' }, 
            3: { halign: 'right', cellWidth: 40 }, 
        };

    } else {
        head = [['No', 'Judul Buku', 'Qty', 'Harga', 'Subtotal']];
        body = (transaksi.items || []).map((item, i) => {
            const qty = Number(item.qty || 0);
            const hs_bruto = Number(item.harga || 0);
            const disc = Number(item.diskonPersen || 0); 
            
            const hs_net = hs_bruto * (1 - disc / 100); 
            const item_subtotal_net = qty * hs_net; 
            const item_subtotal_bruto = qty * hs_bruto;
    
            totalBuku += qty;
            subtotalBruto += item_subtotal_bruto; 
            subtotalNet += item_subtotal_net; 
            
            return [i + 1, item.judul || '-', qty, formatNumber(hs_bruto), formatNumber(item_subtotal_bruto)];
        });

        columnStyles = {
            0: { halign: 'center', cellWidth: 10 }, 
            1: { halign: 'left' }, 
            2: { halign: 'center', cellWidth: 12 }, 
            3: { halign: 'right', cellWidth: 30 }, 
            4: { halign: 'right', cellWidth: 35 }, 
        };
    }

    autoTable(doc, {
        head,
        body,
        startY: currentY,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0],       
            lineColor: [0, 0, 0],       
            lineWidth: 0.1,             
            halign: 'center',
            font: fontName,
            fontStyle: 'bold', // Header Tabel Tetap BOLD (Label)
            fontSize: 9,
            cellPadding: 2,
        },
        styles: {
            font: fontName,
            fontStyle: 'normal', // ISI TABEL (VALUE) JADI NORMAL
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontSize: 9,
            cellPadding: 2,
            valign: 'middle',
            textColor: [0, 0, 0]
        },
        columnStyles: columnStyles, 
        margin: { left: margin.left, right: margin.right },
    });

    currentY = doc.lastAutoTable.finalY + 8; 

    const checkPageOverflow = (y, increment = 10) => { 
        if (y + increment > pageHeight - margin.bottom) {
             doc.addPage();
             return margin.top + 5; 
        }
        return y;
    };
    
    currentY = checkPageOverflow(currentY, 35); 

    // --- 5. SUMMARY & TOTAL ---
    const diskonLain = 0; 
    const biayaTentu = Number(transaksi.totalBiayaLain || 0); 
    const totalTagihanFinal = Number(transaksi.totalNetto || 0); 
    
    const totalItemDiskon = subtotalBruto - subtotalNet; 
    const grandTotalDiskon = totalItemDiskon + diskonLain;
    
    const sisaTagihan = totalTagihanFinal - (transaksi.totalBayar || 0);
    const totalBayarPayment = Number(transaksi.totalBayar || 0);

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 55; 
    
    let summaryY = currentY;

    // --- BAGIAN KIRI: Info Tambahan ---
    doc.setFontSize(9); 
    
    if (!isPayment) {
        // Label -> BOLD
        doc.setFont(fontName, 'bold');
        doc.text('Total Buku:', margin.left, summaryY);
        // Value -> NORMAL
        doc.setFont(fontName, 'normal');
        doc.text(String(totalBuku), margin.left + 22, summaryY);
    }

    // Link Dokumen online (Normal)
    let linkY = summaryY + 8;
    doc.setFontSize(8); 
    doc.setTextColor(100, 100, 100);
    doc.setFont(fontName, 'normal'); 
    doc.text('Dokumen online:', margin.left, linkY);
    doc.textWithLink(link, margin.left , linkY+4, { url: link }); 
    doc.setTextColor(0, 0, 0); 

    // --- BAGIAN KANAN ---
    doc.setFontSize(9); 
    
    if (isPayment) {
        // Garis
        doc.setLineWidth(0.2);
        doc.line(totalColLabelX, summaryY - 2, pageWidth - margin.right, summaryY - 2);

        doc.setFontSize(11);
        // Label -> BOLD
        doc.setFont(fontName, 'bold');
        doc.text('TOTAL DIBAYAR:', totalColLabelX, summaryY + 2);
        
        // Value -> NORMAL
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(totalBayarPayment), totalColValueX, summaryY + 2, { align: 'right' }); 
        
        if(transaksi.sumber) {
            summaryY += 6;
            doc.setFontSize(9);
            // Label -> BOLD
            doc.setFont(fontName, 'bold');
            doc.text('Metode Bayar:', totalColLabelX, summaryY + 2);
            // Value -> NORMAL
            doc.setFont(fontName, 'normal');
            doc.text(transaksi.sumber.toUpperCase(), totalColValueX, summaryY + 2, { align: 'right' }); 
        }

    } else {
        // --- Invoice/Nota ---
        
        // Subtotal Label -> BOLD
        doc.setFont(fontName, 'bold');
        doc.text('Subtotal:', totalColLabelX, summaryY); 
        // Subtotal Value -> NORMAL
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(subtotalBruto), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;

        // Total Diskon (Jika ada)
        if (grandTotalDiskon > 0) {
            // Label -> BOLD
            doc.setFont(fontName, 'bold');
            doc.text('Total Diskon:', totalColLabelX, summaryY); 
            // Value -> NORMAL
            doc.setFont(fontName, 'normal');
            const diskonStr = `(${formatNumber(grandTotalDiskon)})`; 
            doc.text(diskonStr, totalColValueX, summaryY, { align: 'right' }); 
            summaryY += 5;
        }
        
        // Biaya Lain Label -> BOLD
        doc.setFont(fontName, 'bold');
        doc.text('Biaya Lain:', totalColLabelX, summaryY);
        // Biaya Lain Value -> NORMAL
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;

        // Divider Total
        summaryY += 1; 
        doc.setLineWidth(0.2);
        doc.line(totalColLabelX, summaryY, pageWidth - margin.right, summaryY);
        summaryY += 5;

        // TOTAL TAGIHAN Label -> BOLD
        doc.setFontSize(9);
        doc.setFont(fontName, 'bold');
        doc.text('TOTAL TAGIHAN:', totalColLabelX, summaryY);
        // TOTAL TAGIHAN Value -> NORMAL
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 
        
        summaryY += 6;

        // Info Pembayaran (Untuk Nota Belum Lunas)
        if (!isInvoice) {
            doc.setFontSize(9); 
            // Label -> BOLD
            doc.setFont(fontName, 'bold');
            doc.text('Sudah Bayar:', totalColLabelX, summaryY);
            // Value -> NORMAL
            doc.setFont(fontName, 'normal');
            doc.text(formatNumber(transaksi.totalBayar || 0), totalColValueX, summaryY, { align: 'right' }); 
            summaryY += 5;
            
            // Label -> BOLD
            doc.setFont(fontName, 'bold');
            doc.text('Sisa Tagihan:', totalColLabelX, summaryY);
            // Value -> NORMAL
            doc.setFont(fontName, 'normal');
            doc.text(formatNumber(sisaTagihan), totalColValueX, summaryY, { align: 'right' }); 
        }
    }

    return doc;
};

// --- EKSPOR FUNGSI ---
export const generateInvoicePDF = (transaksi) =>
    buildDoc(transaksi, 'invoice').output('datauristring');

export const generateNotaPDF = (transaksi) =>
    buildDoc(transaksi, 'nota').output('datauristring');

// --- FUNGSI BARU UNTUK PAYMENT ---
export const generatePaymentPDF = (payment, allocations) => {
    const paymentData = {
        ...payment,
        items: allocations 
    };
    return buildDoc(paymentData, 'payment').output('datauristring');
};