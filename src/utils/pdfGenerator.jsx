import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA URL FONT (MENGACU KE FOLDER PUBLIC) ---
const FONT_NORMAL_URL = '/fonts/arialnarrow.ttf';
const FONT_BOLD_URL = '/fonts/arialnarrow_bold.ttf';

// --- KONSTANTA PERUSAHAAN ---
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

// Fungsi Helper: Load Font dari URL dan convert ke Base64 (Async)
const loadFont = async (path) => {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Ambil string base64 murni (hapus prefix data:...)
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn(`Gagal memuat font dari ${path}. Menggunakan Helvetica sebagai fallback.`, e);
        return null;
    }
};

/**
 * Fungsi Build Doc (CORE LOGIC)
 * Sifat: ASYNC (Karena harus download font dulu)
 */
const buildDoc = async (transaksi, type) => {
    
    // 1. SETUP KERTAS (PORTRAIT A4)
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a5' 
    });

    // --- SETUP FONT ---
    const fontNormalBase64 = await loadFont(FONT_NORMAL_URL);
    const fontBoldBase64 = await loadFont(FONT_BOLD_URL);
    let fontName = 'helvetica'; // Default fallback

    // Jika font berhasil di-load, daftarkan ke jsPDF
    if (fontNormalBase64 && fontBoldBase64) {
        doc.addFileToVFS('ArialNarrow.ttf', fontNormalBase64);
        doc.addFont('ArialNarrow.ttf', 'ArialNarrow', 'normal');

        doc.addFileToVFS('ArialNarrow-Bold.ttf', fontBoldBase64);
        doc.addFont('ArialNarrow-Bold.ttf', 'ArialNarrow', 'bold');
        
        fontName = 'ArialNarrow'; // Gunakan font custom
    }

    const margin = { top: 10, right: 7.5, bottom:  10 , left: 7.5 };
        const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    const isInvoice = type === 'invoice';
    const isPayment = type === 'payment';

    // Tentukan Judul Dokumen
    let title = 'NOTA PEMBAYARAN';
    if (isInvoice) title = 'INVOICE';
    if (isPayment) title = 'BUKTI PEMBAYARAN';

    // Link
    const linkSlug = isPayment ? 'payment' : (isInvoice ? 'invoice' : 'nota');
    const link = `${baseURL}${linkSlug}/${transaksi.id}`;

    // DEFAULT START BOLD (Untuk Label)
    doc.setFont(fontName, 'bold');

    // --- 2. HEADER DOKUMEN ---
    doc.setFontSize(16);
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
    const infoRightLabelX = pageWidth - margin.right - 50; 
    const infoRightValueX = pageWidth - margin.right;
    
    let leftY = currentY;
    let rightY = currentY;

    // KIRI: Customer
    doc.setFontSize(9);
    doc.setFont(fontName, 'bold'); 
    doc.text('Kepada Yth:', margin.left, leftY); 
    leftY += 4;

    doc.setFont(fontName, 'normal');
    const namaPelanggan = transaksi.namaCustomer || '-'; 
    const splitNama = doc.splitTextToSize(namaPelanggan, 80); 
    doc.text(splitNama, margin.left, leftY);
    leftY += (splitNama.length * 4);
    
    if (isPayment && transaksi.keterangan) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        const ket = `Ket: ${transaksi.keterangan}`;
        const splitKet = doc.splitTextToSize(ket, 80);
        doc.text(splitKet, margin.left, leftY + 2);
        leftY += (splitKet.length * 4) + 2;
        doc.setTextColor(0, 0, 0); 
    }

    doc.setFontSize(9); 

    // KANAN: No Dokumen & Tanggal
    let noDokumenLabel = 'No. Nota';
    let displayNomor = transaksi.id || '-'; 

    if (isInvoice) {
        noDokumenLabel = 'No. Invoice';
    } else if (isPayment) {
        noDokumenLabel = 'No. Payment';
        displayNomor = transaksi.id || '-';
    } else {
        displayNomor = displayNomor.replace('INV', 'NT');
    }

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
            font: fontName, // Pakai font ArialNarrow
            fontStyle: 'bold', 
            fontSize: 9,
            cellPadding: 2,
        },
        styles: {
            font: fontName, // Pakai font ArialNarrow
            fontStyle: 'normal', 
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

    // Cek overflow halaman
    const checkPageOverflow = (y, increment = 10) => { 
        if (y + increment > pageHeight - margin.bottom) {
             doc.addPage();
             return margin.top + 5; 
        }
        return y;
    };
    
    currentY = checkPageOverflow(currentY, 35); 

    // --- 5. SUMMARY & TOTAL ---
    const biayaTentu = Number(transaksi.totalBiayaLain || 0); 
    const totalTagihanFinal = Number(transaksi.totalNetto || 0); 
    const grandTotalDiskon = Number(transaksi.totalDiskon || 0);
    const sisaTagihan = totalTagihanFinal - (transaksi.totalBayar || 0);
    const totalBayarPayment = Number(transaksi.totalBayar || 0);

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 55; 
    let summaryY = currentY;

    // KIRI: Total Buku & Link
    doc.setFontSize(9); 
    if (!isPayment) {
        doc.setFont(fontName, 'bold');
        doc.text('Total Buku:', margin.left, summaryY);
        doc.setFont(fontName, 'normal');
        doc.text(String(totalBuku), margin.left + 22, summaryY);
    }
    let linkY = summaryY + 8;
    doc.setFontSize(8); 
    doc.setTextColor(100, 100, 100);
    doc.setFont(fontName, 'normal'); 
    doc.text('Dokumen online:', margin.left, linkY);
    doc.textWithLink(link, margin.left , linkY+4, { url: link }); 
    doc.setTextColor(0, 0, 0); 

    // KANAN: Angka Total
    doc.setFontSize(9); 
    if (isPayment) {
        doc.setLineWidth(0.2);
        doc.line(totalColLabelX, summaryY - 2, pageWidth - margin.right, summaryY - 2);

        doc.setFontSize(11);
        doc.setFont(fontName, 'bold');
        doc.text('TOTAL DIBAYAR:', totalColLabelX, summaryY + 2);
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(totalBayarPayment), totalColValueX, summaryY + 2, { align: 'right' }); 
        
        if(transaksi.sumber) {
            summaryY += 6;
            doc.setFontSize(9);
            doc.setFont(fontName, 'bold');
            doc.text('Metode Bayar:', totalColLabelX, summaryY + 2);
            doc.setFont(fontName, 'normal');
            doc.text(transaksi.sumber.toUpperCase(), totalColValueX, summaryY + 2, { align: 'right' }); 
        }
    } else {
        doc.setFont(fontName, 'bold');
        doc.text('Subtotal:', totalColLabelX, summaryY); 
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(subtotalBruto), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;

        if (grandTotalDiskon > 0) {
            doc.setFont(fontName, 'bold');
            doc.text('Total Diskon:', totalColLabelX, summaryY); 
            doc.setFont(fontName, 'normal');
            const diskonStr = `(${formatNumber(grandTotalDiskon)})`; 
            doc.text(diskonStr, totalColValueX, summaryY, { align: 'right' }); 
            summaryY += 5;
        }
        
        doc.setFont(fontName, 'bold');
        doc.text('Biaya Lain:', totalColLabelX, summaryY);
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 2;

        summaryY += 1; 
        doc.setLineWidth(0.2);
        doc.line(totalColLabelX, summaryY, pageWidth - margin.right, summaryY);
        summaryY += 5;

        doc.setFontSize(9);
        doc.setFont(fontName, 'bold');
        doc.text('TOTAL TAGIHAN:', totalColLabelX, summaryY);
        doc.setFont(fontName, 'normal');
        doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 
        summaryY += 5;

        if (!isInvoice) {
            doc.setFontSize(9); 
            doc.setFont(fontName, 'bold');
            doc.text('Sudah Bayar:', totalColLabelX, summaryY);
            doc.setFont(fontName, 'normal');
            doc.text(formatNumber(transaksi.totalBayar || 0), totalColValueX, summaryY, { align: 'right' }); 
            summaryY += 5;
            
            doc.setFont(fontName, 'bold');
            doc.text('Sisa Tagihan:', totalColLabelX, summaryY);
            doc.setFont(fontName, 'normal');
            doc.text(formatNumber(sisaTagihan), totalColValueX, summaryY, { align: 'right' }); 
        }
    }

    // --- 6. TANDA TANGAN ---
    let signY = Math.max(summaryY, linkY + 10) + 10;
    
    signY = checkPageOverflow(signY, 40);

    const leftSignX = margin.left + 25; 
    const rightSignX = pageWidth - margin.right - 25; 

    doc.setFontSize(9);
    doc.setFont(fontName, 'normal');

    // Kiri: Hormat Kami
    doc.text("Hormat Kami,", leftSignX, signY, { align: 'center' });
    // Kanan: Penerima
    doc.text("Penerima,", rightSignX, signY, { align: 'center' });

    // Space Tanda Tangan
    const nameY = signY + 25;
    doc.setFont(fontName, 'bold');

    // Kiri: Garis bawah
    doc.text("(________________)", leftSignX, nameY, { align: 'center' });

    // Kanan: Nama Customer
    doc.text(`( ${transaksi.namaCustomer || '....................'} )`, rightSignX, nameY, { align: 'center' });

    return doc;
};

// --- EKSPOR FUNGSI (Perlu Async/Await saat dipanggil) ---

export const generateInvoicePDF = async (transaksi) => {
    const doc = await buildDoc(transaksi, 'invoice');
    return doc.output('datauristring');
};

export const generateNotaPDF = async (transaksi) => {
    const doc = await buildDoc(transaksi, 'nota');
    return doc.output('datauristring');
};

export const generatePaymentPDF = async (payment, allocations) => {
    const paymentData = {
        ...payment,
        items: allocations 
    };
    const doc = await buildDoc(paymentData, 'payment');
    return doc.output('datauristring');
};