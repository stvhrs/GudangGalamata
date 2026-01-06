// ==========================================
// CONFIG & HELPERS (Pastikan ini ada di file Anda)
// ==========================================
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });

// --- KONFIGURASI HTML BOLD ---
const BOLD_START = '<b>';
const BOLD_END = '</b>';
const HTML_TAG_LEN = 7; 

// Helper Padding Biasa
const pad = (str, len, align = 'left') => {
    let s = String(str || '').substring(0, len); 
    if (align === 'left') return s.padEnd(len, ' ');
    if (align === 'right') return s.padStart(len, ' ');
    const leftPad = Math.floor((len - s.length) / 2);
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

// Helper Padding Khusus Bold HTML
const padBold = (str, len, align = 'left') => {
    const boldStr = BOLD_START + str + BOLD_END;
    return pad(boldStr, len + HTML_TAG_LEN, align);
};

const TOTAL_WIDTH = 96; 
const HR = "-".repeat(TOTAL_WIDTH) + "\n";

// ==========================================
// FUNCTION GENERATE TEXT
// ==========================================
// ==========================================
// FUNCTION GENERATE TEXT (INVOICE / NOTA)
// ==========================================
// ==========================================
// FUNCTION GENERATE TEXT (INVOICE / NOTA)
// ==========================================
export const generateTransaksiText = (transaksi, items, type = 'INVOICE') => {
    const dataItems = (items && items.length > 0) ? items : [];
    const TARGET_LINES = 29; 
    let currentLine = 0;
    let txt = "";

    const addLine = (str) => {
        txt += str;
        const linesInStr = (str.match(/\n/g) || []).length;
        currentLine += linesInStr;
    };

    // 1. HITUNG TOTAL QTY
    const totalQtyBuku = dataItems.reduce((acc, curr) => acc + (Number(curr.qty || curr.jumlah || 0)), 0);

    // --- HEADER ---
    addLine(padBold(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    const judulDokumen = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    addLine(padBold(judulDokumen, TOTAL_WIDTH, 'center') + "\n"); 
    addLine(HR);

    const idDokumen = transaksi.id || '-';
    const namaPelanggan = transaksi.namaCustomer || 'Umum';
    const tanggal = formatDate(transaksi.tanggal);

    // --- BARIS 1: No Trans (Kiri) ... Tanggal (Kanan)
    const txtKiri1 = "No. Trans : " + idDokumen;
    const txtKanan1 = "Tanggal : " + tanggal;
    const gap1 = TOTAL_WIDTH - (txtKiri1.length + txtKanan1.length);
    addLine(txtKiri1 + " ".repeat(gap1 > 0 ? gap1 : 0) + txtKanan1 + "\n");
    
    // --- BARIS 2: Customer Saja (Total Buku dipindah ke bawah) ---
    // Gunakan spasi ekstra di label agar sejajar dengan "No. Trans :"
    const lblCust = "Customer  : "; 
    const valCust = namaPelanggan.substring(0, 50); 
    
    // Cetak Customer (Tanpa Total Buku di kanan)
    addLine(lblCust + BOLD_START + valCust + BOLD_END + "\n"); 

    addLine(HR);

    // --- TABEL HEADER ---
    const wNo = 3; 
    const wQty = 7;  
    const wHrg = 15; 
    const wDisc = 7; 
    const wSub = 17; 
    const wItem = TOTAL_WIDTH - (wNo + wQty + wHrg + wDisc + wSub); 

    addLine(padBold("No", wNo) + padBold("Judul Buku", wItem) + padBold("Qty", wQty, 'center') + 
            padBold("Harga", wHrg, 'right') + padBold("Disc", wDisc, 'right') + padBold("Subtotal", wSub, 'right') + "\n");
    addLine(HR);

    // --- ITEMS ---
    dataItems.forEach((item, i) => {
        const harga = Number(item.harga || item.hargaSatuan || 0);
        const qty = Number(item.qty || item.jumlah || 0);
        const subtotal = Number(item.subtotal || 0);
        
        let fullTitle = (item.judul || item.productName || '-');
        let safeLen = wItem - 1; 
        
        let line1 = fullTitle.substring(0, safeLen).trim();
        let line2 = fullTitle.length > safeLen ? fullTitle.substring(safeLen, safeLen * 2).trim() : "";

        addLine(pad((i + 1).toString(), wNo) + 
                pad(line1, wItem) + 
                pad(qty.toString(), wQty, 'center') + 
                pad(formatNumber(harga), wHrg, 'right') + 
                pad("-", wDisc, 'right') + 
                pad(formatNumber(subtotal), wSub, 'right') + "\n");
        
        if (line2) addLine(pad("", wNo) + pad(line2, wItem) + "\n");
    });

    // --- FOOTER PUSH ---
    const FOOTER_HEIGHT = 8; 
    let linesRemaining = TARGET_LINES - (currentLine % TARGET_LINES);
    if (linesRemaining < FOOTER_HEIGHT) {
        for (let k = 0; k < linesRemaining; k++) addLine("\n");
        linesRemaining = TARGET_LINES;
    }
    const emptyLinesNeeded = linesRemaining - FOOTER_HEIGHT;
    if (emptyLinesNeeded > 0) {
        for (let k = 0; k < emptyLinesNeeded; k++) addLine("\n");
    }

    // --- FINANCIAL SUMMARY ---
    addLine(HR);
    
    const totalBruto = Number(transaksi.totalBruto || 0);
    const totalDiskon = Number(transaksi.totalDiskon || 0);
    const totalBiayaLain = Number(transaksi.totalBiayaLain || 0);
    const totalNetto = Number(transaksi.totalNetto || 0);
    const totalBayar = Number(transaksi.totalBayar || 0);
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);

    const wF1 = 30; // Kolom 1
    const wF2 = 26; // Kolom 2
    const wF3 = 40; // Kolom 3 (Lebar cukup untuk Biaya + Total Buku)

    // Helper render Row Aligned
    const renderRowAligned = (l1, v1, l2, v2, l3, v3, bold1 = false, bold2 = false, bold3 = false) => {
        let str = "";
        // COL 1
        if (l1) {
            const labelPadded = pad(l1, 8); 
            const content = `${labelPadded}: ${v1}`;
            str += bold1 ? padBold(content, wF1, 'left') : pad(content, wF1, 'left');
        } else str += pad("", wF1);

        // COL 2
        if (l2) {
            const labelPadded = pad(l2, 6);
            const content = `${labelPadded}: ${v2}`;
            str += bold2 ? padBold(content, wF2, 'left') : pad(content, wF2, 'left');
        } else str += pad("", wF2);

        // COL 3
        if (l3) {
            const labelPadded = pad(l3, 8); 
            const content = `${labelPadded}: ${v3}`; 
            str += bold3 ? padBold(content, wF3, 'left') : pad(content, wF3, 'left');
        } else str += pad("", wF3);

        return str + "\n";
    };

    // --- MODIFIKASI DISINI (GABUNG BIAYA + TOTAL BUKU) ---
    // Kita gabung string untuk nilai Kolom 3 agar tampil: "Biaya: 0   Total Buku: 10"
    
    const valBiayaDanBuku = `${formatNumber(totalBiayaLain)}   Total Buku: ${formatNumber(totalQtyBuku)}`;

    // Baris 1: Bruto | Disc | Biaya + Total Buku (Normal)
    addLine(renderRowAligned(
        "Bruto", formatNumber(totalBruto), 
        "Disc", formatNumber(totalDiskon), 
        "Biaya", valBiayaDanBuku, 
        false, false, false
    ));

    // Baris 2: Tagihan | Bayar | Sisa (BOLD)
    addLine(renderRowAligned(
        "Tagihan", formatNumber(totalNetto), 
        "Bayar", formatNumber(totalBayar), 
        "Sisa", formatNumber(sisaTagihan), 
        true, true, true 
    ));
    
    addLine("\n"); 
    const spacerTTD = " ".repeat(20); 
    const wTTD = 38; 
    addLine(pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n");
    addLine("\n\n"); 
    addLine(pad("(________________)", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center'));

    return txt;
};  