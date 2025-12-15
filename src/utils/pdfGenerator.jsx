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
 * - Fix: Jarak Total Tagihan
 * - Fix: Biaya Lain selalu muncul (walau 0)
 * - Fix: Link Dokumen tetap ada
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
    const title = isInvoice ? 'INVOICE' : 'NOTA PEMBAYARAN';
    const link = `${baseURL}/${isInvoice ? 'invoice' : 'nota'}/${transaksi.id}`;

    // Font setting (Helvetica sebagai pengganti Arial)
    const fontName = 'helvetica';

    // --- 2. HEADER DOKUMEN ---
    doc.setFontSize(16);
    doc.setFont(fontName, 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(12);
    doc.text(title, pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 3;

    // Garis Divider Header
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    
    currentY += 8; 

    // --- 3. INFO PELANGGAN & DOKUMEN ---
    // Geser label kanan agar tidak terlalu mepet
    const infoRightLabelX = pageWidth - margin.right - 50; 
    const infoRightValueX = pageWidth - margin.right;
    
    let leftY = currentY;
    let rightY = currentY;

    // KIRI: Pelanggan
    doc.setFontSize(9);
    doc.setFont(fontName, 'bold');
    doc.text('Kepada Yth:', margin.left, leftY);
    leftY += 4;
    doc.setFont(fontName, 'normal');
    
    const namaPelanggan = transaksi.namaPelanggan || '-';
    const splitNama = doc.splitTextToSize(namaPelanggan, 80); 
    doc.text(splitNama, margin.left, leftY);
    leftY += (splitNama.length * 4);

    // KANAN: No Dokumen & Tanggal
    const noDokumenLabel = isInvoice ? 'No. Invoice' : 'No. Nota';
    let displayNomor = transaksi.nomorInvoice || '-';
    if (!isInvoice) displayNomor = displayNomor.replace('INV', 'NT');

    doc.setFont(fontName, 'bold');
    doc.text(noDokumenLabel, infoRightLabelX, rightY);
    doc.setFont(fontName, 'normal');
    doc.text(displayNomor, infoRightValueX, rightY, { align: 'right' });
    rightY += 5;

    doc.setFont(fontName, 'bold');
    doc.text('Tanggal', infoRightLabelX, rightY);
    doc.setFont(fontName, 'normal');
    doc.text(formatDate(transaksi.tanggal), infoRightValueX, rightY, { align: 'right' });
    rightY += 5;

    currentY = Math.max(leftY, rightY) + 6;

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
            lineWidth: 0.1,             
            halign: 'center',
            font: fontName,
            fontStyle: 'bold',
            fontSize: 9,
            cellPadding: 2,
        },
        styles: {
            font: fontName,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontSize: 9,
            cellPadding: 2,
            valign: 'middle',
            textColor: [0, 0, 0]
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 }, 
            1: { halign: 'left' }, 
            2: { halign: 'center', cellWidth: 12 }, 
            3: { halign: 'right', cellWidth: 30 }, 
            4: { halign: 'right', cellWidth: 35 }, 
        },
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
    const diskonLain = Number(transaksi.diskonLain || 0);
    const biayaTentu = Number(transaksi.biayaTentu || 0); // Biaya lain
    const totalTagihanFinal = Number(transaksi.totalTagihan || 0); 
    const totalItemDiskon = subtotalBruto - subtotalNet; 
    const grandTotalDiskon = totalItemDiskon + diskonLain;
    const sisaTagihan = totalTagihanFinal - (transaksi.jumlahTerbayar || 0);

    const totalColValueX = pageWidth - margin.right; 
    // FIX JARAK: Geser Label lebih ke kiri (sebelumnya -45, sekarang -55)
    const totalColLabelX = totalColValueX - 55; 
    
    let summaryY = currentY;

    // --- BAGIAN KIRI: Info Tambahan ---
    doc.setFontSize(9); 
    doc.setFont(fontName, 'bold');
    doc.text('Total Buku:', margin.left, summaryY);
    doc.setFont(fontName, 'normal');
    doc.text(String(totalBuku), margin.left + 22, summaryY);

    // FIX LINK: Link tetap dipertahankan
    let linkY = summaryY + 8;
    doc.setFontSize(8); 
    doc.setTextColor(100, 100, 100); 
    doc.text('Dokumen online:', margin.left, linkY);
    doc.textWithLink(link, margin.left + 5, linkY, { url: link }); 
    doc.setTextColor(0, 0, 0); 

    // --- BAGIAN KANAN: Angka ---
    doc.setFontSize(9); 
    
    // Subtotal
    doc.setFont(fontName, 'normal'); 
    doc.text('Subtotal:', totalColLabelX, summaryY); 
    doc.text(formatNumber(subtotalBruto), totalColValueX, summaryY, { align: 'right' }); 
    summaryY += 5;

    // Total Diskon (Jika ada)
    if (grandTotalDiskon > 0) {
        doc.text('Total Diskon:', totalColLabelX, summaryY); 
        const diskonStr = `(${formatNumber(grandTotalDiskon)})`; 
        doc.text(diskonStr, totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;
    }
    
    // FIX BIAYA LAIN: Selalu muncul (hapus kondisi if > 0)
    doc.text('Biaya Lain:', totalColLabelX, summaryY);
    doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
    summaryY += 5;

    // Divider Total
    summaryY += 1; 
    doc.setLineWidth(0.2);
    doc.line(totalColLabelX, summaryY, pageWidth - margin.right, summaryY);
    summaryY += 5;

    // TOTAL TAGIHAN
    doc.setFontSize(11);
    doc.setFont(fontName, 'bold');
    doc.text('TOTAL TAGIHAN:', totalColLabelX, summaryY);
    doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 
    
    summaryY += 6;

    // Info Pembayaran (Untuk Nota Belum Lunas)
    if (!isInvoice) {
        doc.setFontSize(9); 
        doc.setFont(fontName, 'normal');
        doc.text('Sudah Bayar:', totalColLabelX, summaryY);
        doc.text(formatNumber(transaksi.jumlahTerbayar || 0), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;
        
        doc.setFont(fontName, 'bold');
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