import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA ---
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    // Alamat dihapus
};

const baseURL = 'https://gudanggalatama.web.app/';

// --- FUNGSI HELPER ---
const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(value || 0);

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
 * Fungsi inti untuk membangun dokumen PDF
 * @param {object} transaksi - Objek data transaksi
 * @param {string} type - 'invoice' atau 'nota'
 * @returns {jsPDF} - Objek dokumen jsPDF
 */
const buildDoc = (transaksi, type) => {
    
    // --- 1. PENGATURAN KERTAS ---
    let doc, margin;

    // A4 Portrait
    doc = new jsPDF('portrait', 'mm', 'a4'); 
    margin = { top: 20, right: 20, bottom: 30, left: 20 };

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    const isInvoice = type === 'invoice';
    const title = isInvoice ? 'INVOICE' : 'Nota PEMBAYARAN';
    const link = `${baseURL}/${isInvoice ? 'invoice' : 'nota'}/${transaksi.id}`;

    // --- 2. HEADER ---
    doc.setFontSize(18); 
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text(title, pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 7; 

    // --- 3. INFO PELANGGAN & TRANSAKSI ---
    const infoRightColX = pageWidth / 2 + 10;
    const infoRightColValueX = infoRightColX + 25;
    
    doc.setFontSize(9.5); 
    doc.setFont('helvetica', 'bold');
    doc.text('Kepada Yth:', margin.left, currentY);
    
    const noDokumenLabel = isInvoice ? 'No. Invoice:' : 'No. Nota:';
    doc.text(noDokumenLabel, infoRightColX, currentY);
    
    // LOGIC REPLACE: INV -> NT jika bukan Invoice
    let displayNomor = transaksi.nomorInvoice || '-';
    if (!isInvoice) {
        displayNomor = displayNomor.replace('INV', 'NT');
    }

    doc.setFont('helvetica', 'normal');
    doc.text(displayNomor, infoRightColValueX, currentY);
    
    currentY += 5; 
    
    doc.text(transaksi.namaPelanggan || '-', margin.left, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text('Tanggal:', infoRightColX, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(transaksi.tanggal), infoRightColValueX, currentY);
    
    currentY += 8; 

    // --- 4. TABEL ITEM ---
    const head = [['No', 'Judul Buku', 'Qty', 'Harga', 'Subtotal']];
    let totalBuku = 0;
    let subtotalBruto = 0; 
    let subtotalNet = 0; 

    const body = (transaksi.items || []).map((item, i) => {
        const qty = Number(item.jumlah || 0);
        const hs_bruto = Number(item.hargaSatuan || 0);
        const disc = Number(item.diskonPersen || 0); 

        const hs_net = hs_bruto * (1 - disc / 100); 
        const item_subtotal_net = qty * hs_net; 
        const item_subtotal_bruto = qty * hs_bruto;

        totalBuku += qty;
        subtotalBruto += item_subtotal_bruto; 
        subtotalNet += item_subtotal_net; 
        
        return [i + 1, item.judulBuku || '-', qty, formatNumber(hs_bruto), formatNumber(item_subtotal_bruto)];
    });

    autoTable(doc, {
        head,
        body,
        startY: currentY,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            halign: 'center',
            fontSize: 9,
            fontStyle: 'bold',
            cellPadding: 1.5,
        },
        styles: {
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            fontSize: 9,
            cellPadding: 1.5,
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 }, 
            1: { cellWidth: 68 }, 
            2: { halign: 'center', cellWidth: 15 }, 
            3: { halign: 'right', cellWidth: 35 }, 
            4: { halign: 'right', cellWidth: 40 }, 
        },
        margin: { left: margin.left, right: margin.right },
    });

    currentY = doc.lastAutoTable.finalY || currentY;
    currentY += 7; 
    
    const checkPageOverflow = (y, increment = 5) => { 
        if (y + increment > pageHeight - margin.bottom - 20) {
             if (y > pageHeight - margin.bottom) {
                 return pageHeight - margin.bottom;
             }
        }
        return y + increment;
    };
    
    currentY = checkPageOverflow(currentY, 0);

    // --- 5. SUMMARY & TOTAL ---
    const diskonLain = Number(transaksi.diskonLain || 0);
    const biayaTentu = Number(transaksi.biayaTentu || 0);
    const totalTagihanFinal = Number(transaksi.totalTagihan || 0); 
    const totalItemDiskon = subtotalBruto - subtotalNet; 
    const grandTotalDiskon = totalItemDiskon + diskonLain;
    const sisaTagihan = totalTagihanFinal - (transaksi.jumlahTerbayar || 0);

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50; 
    
    let summaryY = currentY;

    // --- BAGIAN KIRI: TOTAL BUKU & LINK ONLINE ---
    
    doc.setFontSize(9); 
    doc.setFont('helvetica', 'bold');
    doc.text('Total Buku:', margin.left, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(totalBuku), margin.left + 25, summaryY, { align: 'left' });

    // Link Online (di bawah Total Buku)
    let linkY = summaryY + 6; 
    
    doc.setFontSize(7); 
    doc.setTextColor(120, 120, 120); 
    const linkLabel = 'Lihat dokumen ini secara online:';
    
    doc.text(linkLabel, margin.left, linkY);
    linkY += 3.5; 
    doc.textWithLink(link, margin.left, linkY, { url: link }); 
    doc.setTextColor(0, 0, 0); 

    // --- BAGIAN KANAN: RINCIAN HARGA ---
    doc.setFontSize(9); 
    doc.setFont('helvetica', 'normal'); 
    doc.text('Subtotal:', totalColLabelX, summaryY); 
    doc.text(formatNumber(subtotalBruto), totalColValueX, summaryY, { align: 'right' }); 
    
    summaryY = checkPageOverflow(summaryY, 5);

    if (grandTotalDiskon > 0) {
        doc.setFont('helvetica', 'normal');
        doc.text('Total Diskon:', totalColLabelX, summaryY); 
        const diskonStr = `(${formatNumber(grandTotalDiskon)})`; 
        doc.text(diskonStr, totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, 5);
    }
    
    if (biayaTentu > 0) {
        doc.setFont('helvetica', 'normal');
        doc.text('Biaya Tambahan:', totalColLabelX, summaryY);
        doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, 5);
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Total Tagihan:', totalColLabelX, summaryY);
    doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 

    if (!isInvoice) {
        summaryY = checkPageOverflow(summaryY, 5);
        
        doc.setFontSize(9); 
        doc.setFont('helvetica', 'normal');
        doc.text('Total Terbayar:', totalColLabelX, summaryY);
        doc.text(formatNumber(transaksi.jumlahTerbayar || 0), totalColValueX, summaryY, { align: 'right' }); 
        
        summaryY = checkPageOverflow(summaryY, 5);
        
        doc.setFontSize(9); 
        doc.setFont('helvetica', 'bold');
        doc.text('Sisa Tagihan:', totalColLabelX, summaryY);
        doc.text(formatNumber(sisaTagihan), totalColValueX, summaryY, { align: 'right' }); 
    }

    return doc;
};

// --- EKSPOR FUNGSI ---
export const generateInvoicePDF = (transaksi) =>
    buildDoc(transaksi, 'invoice').output('datauristring');

export const generateNotaPDF = (transaksi) =>
    buildDoc(transaksi, 'nota').output('datauristring');