const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });

// Helper Padding
const pad = (str, len, align = 'left') => {
    let s = String(str || '').substring(0, len); 
    if (align === 'left') return s.padEnd(len, ' ');
    if (align === 'right') return s.padStart(len, ' ');
    const leftPad = Math.floor((len - s.length) / 2);
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

const TOTAL_WIDTH = 96; 
const HR = "-".repeat(TOTAL_WIDTH) + "\n";

export const generateTransaksiText = (transaksi, items, type = 'INVOICE') => {
    const dataItems = (items && items.length > 0) ? items : [];
    
    // Target 29 Baris Efektif per Halaman (5.5 Inch)
    const TARGET_LINES = 29; 
    let currentLine = 0;
    let txt = "";

    const addLine = (str) => {
        txt += str;
        const linesInStr = (str.match(/\n/g) || []).length;
        currentLine += linesInStr;
    };

    // --- HEADER ---
    addLine(pad(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    const judulDokumen = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    addLine(pad(judulDokumen, TOTAL_WIDTH, 'center') + "\n"); 
    addLine(HR);

    const idDokumen = transaksi.id || '-';
    const namaPelanggan = transaksi.namaCustomer || 'Umum';
    const tanggal = formatDate(transaksi.tanggal);

    addLine("No. Trans : " + pad(idDokumen, 35) + pad("Tanggal : " + tanggal, TOTAL_WIDTH - 47, 'right') + "\n");
    addLine("Customer  : " + pad(namaPelanggan.substring(0, 70), 70) + "\n"); 
    addLine(HR);

    // --- TABEL HEADER ---
    const wNo = 3; const wQty = 4; const wHrg = 13; 
    const wDisc = 7; const wSub = 16; 
    const wItem = TOTAL_WIDTH - (wNo + wQty + wHrg + wDisc + wSub); 

    addLine(pad("No", wNo) + pad("Judul Buku", wItem) + pad("Qty", wQty, 'center') + 
            pad("Harga", wHrg, 'right') + pad("Disc", wDisc, 'right') + pad("Subtotal", wSub, 'right') + "\n");
    addLine(HR);

    // --- ITEMS ---
    dataItems.forEach((item, i) => {
        const harga = Number(item.harga || item.hargaSatuan || 0);
        const qty = Number(item.qty || item.jumlah || 0);
        const subtotal = Number(item.subtotal || 0);
        
        let fullTitle = (item.judul || item.productName || '-');
        let line1 = fullTitle.substring(0, wItem).trim();
        let line2 = fullTitle.length > wItem ? fullTitle.substring(wItem, wItem * 2).trim() : "";

        addLine(pad((i + 1).toString(), wNo) + 
                pad(line1, wItem) + 
                pad(formatNumber(qty), wQty, 'center') + 
                pad(formatNumber(harga), wHrg, 'right') + 
                pad("-", wDisc, 'right') + 
                pad(formatNumber(subtotal), wSub, 'right') + "\n");
        
        if (line2) addLine(pad("", wNo) + pad(line2, wItem) + "\n");
    });

    // --- LOGIKA FOOTER (DIPERBAIKI) ---
    // Kita cek apakah sisa baris di halaman ini cukup untuk footer?
    // Footer butuh sekitar 8 baris.
    const FOOTER_HEIGHT = 8;
    
    // Hitung posisi kita sekarang ada di baris ke berapa dalam halaman (modulus)
    // Contoh: currentLine = 10, TARGET = 29. linesUsedInPage = 10.
    const linesUsedInPage = currentLine % TARGET_LINES;
    const linesRemaining = TARGET_LINES - linesUsedInPage;

    // 🔥 LOGIKA BARU: 
    // Jika sisa baris KURANG DARI kebutuhan footer, kita lompat ke halaman baru.
    // Jika CUKUP, kita cetak langsung (tidak perlu didorong sampai bawah).
    if (linesRemaining < FOOTER_HEIGHT) {
        // Tidak muat -> Isi sisa halaman dengan enter biar pindah halaman
        for (let k = 0; k < linesRemaining; k++) {
            addLine("\n");
        }
    } else {
        // Muat -> Tidak perlu tambah enter aneh-aneh.
        // Opsional: Tambah 1 baris kosong biar gak nempel banget sama item terakhir
        // addLine("\n"); 
    }

    // --- CETAK FOOTER ---
    addLine(HR);
    const totalNetto = Number(transaksi.totalNetto || 0);
    const totalBayar = Number(transaksi.totalBayar || 0);
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);
    const labelSisa = sisaTagihan > 0 ? "Kurang" : "Kembali";

    const colW = 32;
    const renderFooterRow = (lbl1, val1, lbl2, val2, lbl3, val3) => {
        return pad(lbl1 ? `${lbl1}: ${val1}` : "", colW, 'left') + 
               pad(lbl2 ? `${lbl2}: ${val2}` : "", colW, 'left') + 
               pad(lbl3 ? `${lbl3}: ${val3}` : "", colW, 'right') + "\n";
    };

    addLine(renderFooterRow("Bruto", formatNumber(transaksi.totalBruto), "Disc", "0", "TAGIHAN", formatNumber(totalNetto)));
    addLine(renderFooterRow("Bayar", formatNumber(totalBayar), labelSisa, formatNumber(Math.abs(sisaTagihan)), "", ""));
    
    addLine("\n"); 
    const spacerTTD = " ".repeat(20); 
    const wTTD = 38; 
    
    addLine(pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n");
    addLine("\n\n"); 
    addLine(pad("(________________)", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center'));

    return txt;
};