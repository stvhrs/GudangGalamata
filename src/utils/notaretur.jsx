import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    // Alamat dihapus
    hp: "0882-0069-05391"
};

const terms = [
    'Bukti retur ini sah dan diterbitkan oleh sistem.',
    'Barang yang diretur telah mengurangi tagihan atau stok sesuai ketentuan.',
];

// --- HELPER ---
const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric', 
    hour: '2-digit', minute:'2-digit' 
});

const buildDoc = (data) => {
    const doc = new jsPDF('portrait', 'mm', 'a4'); 
    const margin = { top: 20, right: 20, bottom: 30, left: 20 };
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = margin.top;

    // --- 1. HEADER ---
    doc.setFontSize(18); 
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(11); 
    doc.text("NOTA RETUR", pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.2); 
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 8; 

    // --- 2. INFO TRANSAKSI ---
    const idDokumen = data.id || '-';
    const refDokumen = data.nomorInvoice || data.idTransaksi || '-'; 

    let namaPelanggan = data.namaPelanggan;
    if (!namaPelanggan && data.keterangan) {
        const match = data.keterangan.match(/\((.*?)\)$/);
        namaPelanggan = match ? match[1] : "-"; 
    }

    const infoX = pageWidth / 2 + 10;
    
    doc.setFontSize(9.5); 
    doc.setFont('helvetica', 'bold'); doc.text('No. Retur:', margin.left, currentY);
    doc.setFont('helvetica', 'normal'); doc.text(idDokumen, margin.left + 30, currentY);
    currentY += 5;
    
    doc.setFont('helvetica', 'bold'); doc.text('Ref. Invoice:', margin.left, currentY);
    doc.setFont('helvetica', 'normal'); doc.text(String(refDokumen), margin.left + 30, currentY);
    currentY += 5;

    const rightY = currentY - 10;
    doc.setFont('helvetica', 'bold'); doc.text('Tanggal:', infoX, rightY);
    doc.setFont('helvetica', 'normal'); doc.text(formatDate(data.tanggal), infoX + 25, rightY);
    
    if (namaPelanggan && namaPelanggan !== '-') {
        doc.setFont('helvetica', 'bold'); doc.text('Pelanggan:', infoX, rightY + 5);
        doc.setFont('helvetica', 'normal'); doc.text(namaPelanggan, infoX + 25, rightY + 5);
    }

    // --- PERUBAHAN 1: Jarak diperkecil agar tabel naik ---
    currentY += 2; 

    // --- 3. TABEL ITEM RETUR ---
    const head = [['No', 'Item Buku', 'Qty', 'Harga', 'Subtotal']];
    let body = [];
    let calculatedTotal = 0;

    // Normalisasi Data
    let listItems = data.itemsReturDetail;
    if (typeof listItems === 'string') {
        try { listItems = JSON.parse(listItems); } catch (e) { listItems = []; }
    }
    if (listItems && typeof listItems === 'object' && !Array.isArray(listItems)) {
        listItems = Object.values(listItems);
    }

    // Logic Data Body
    if (Array.isArray(listItems) && listItems.length > 0) {
        body = listItems.map((item, i) => {
            const judul = item.judulBuku || item.judul || item.nama_buku || '-';
            // Pastikan qty absolut (positif)
            const qty = Math.abs(Number(item.qty || item.quantity || item.jumlah || 0));
            const harga = Number(item.hargaSatuan || item.harga || 0);
            let sub = Number(item.subtotal || 0);

            if (!sub && harga > 0 && qty > 0) sub = harga * qty;
            
            // --- PERUBAHAN 2: Pastikan Subtotal Positif (Math.abs) ---
            sub = Math.abs(sub); 
            
            calculatedTotal += sub;

            return [
                i + 1,
                judul,
                qty,
                formatNumber(harga),
                formatNumber(sub) // Tampilkan angka positif
            ];
        });
    } else if (data.itemsReturRingkas) {
        const itemsStr = data.itemsReturRingkas.split(/,\s*/); 
        body = itemsStr.map((str, i) => {
            const match = str.match(/(.*)\s\(x(\d+)\)/);
            const nama = match ? match[1] : str;
            const qty = match ? match[2] : '1';
            return [i + 1, nama, qty, '-', '-'];
        });
    }

    // --- RENDER TABEL (STYLING KANTIP) ---
    autoTable(doc, {
        startY: currentY,
        head: head,
        body: body,
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

    // --- 4. SUMMARY FOOTER ---
    currentY = doc.lastAutoTable.finalY + 5;
    
    // Pastikan Total Pengembalian Positif
    let netRefund = Math.abs(Number(data.jumlah || data.totalHarga || 0));
    if (netRefund === 0 && calculatedTotal > 0) {
        netRefund = calculatedTotal;
    }

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 50;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Pengembalian:', totalColLabelX, currentY);
    doc.text(formatNumber(netRefund), totalColValueX, currentY, { align: 'right' });

    // --- 5. FOOTER KETERANGAN ---
    const footerY = doc.internal.pageSize.getHeight() - margin.bottom;
    
    if (data.keterangan) {
        doc.setFontSize(8); doc.setFont('helvetica', 'italic');
        doc.text(`Catatan: ${data.keterangan}`, margin.left, footerY - 10);
    }
    
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(terms[0], margin.left, footerY);
    doc.text(terms[1], margin.left, footerY + 4);

    return doc;
};

export const generateNotaReturPDF = (data) => buildDoc(data).output('datauristring');