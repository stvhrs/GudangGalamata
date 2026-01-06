// ==========================================
// 1. CONFIG & HELPERS (GLOBAL)
// ==========================================

export const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

// --- KONFIGURASI PRINTER ---
export const TOTAL_WIDTH = 96; // Lebar karakter (Mode Elite/Condensed)
export const HR = "-".repeat(TOTAL_WIDTH) + "\n";
export const FF = "\x0C"; // Form Feed

// --- KONFIGURASI BOLD ---
const BOLD_START = '<b>';
const BOLD_END = '</b>';
const HTML_TAG_LEN = 7; 

export const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

export const formatDate = (timestamp) => {
    if(!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('id-ID', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute:'2-digit' 
    }).replace(/\./g, ':');
};

// --- FUNGSI PADDING (STANDARD) ---
export const pad = (str, len, align = 'left') => {
    let s = String(str || '').substring(0, len); 
    if (align === 'left') return s.padEnd(len, ' ');
    if (align === 'right') return s.padStart(len, ' ');
    
    // Center logic
    const leftPad = Math.floor((len - s.length) / 2);
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

// --- FUNGSI PADDING (BOLD) ---
export const padBold = (str, len, align = 'left') => {
    const boldStr = BOLD_START + str + BOLD_END;
    return pad(boldStr, len + HTML_TAG_LEN, align);
};

// ==========================================
// [HELPER BARU] AUTO PUSH FOOTER & TTD
// ==========================================
const printFooterWithPush = (addLine, currentLine, targetLines, namaPelanggan, capStatus = "") => {
    // 1. Hitung Tinggi Blok Footer (Cap + TTD)
    // - Cap Status (jika ada): 1 baris
    // - Hormat Kami: 1 baris
    // - Spasi TTD: 2 baris
    // - Nama: 1 baris
    const footerHeight = capStatus ? 5 : 4; 
    
    // 2. Hitung sisa baris di halaman ini
    let linesRemaining = targetLines - (currentLine % targetLines);
    
    // 3. Jika sisa baris tidak cukup untuk footer, ganti halaman dulu
    if (linesRemaining < footerHeight) {
        for (let k = 0; k < linesRemaining; k++) addLine("\n");
        linesRemaining = targetLines; 
    }

    // 4. Dorong ke bawah (Isi kekosongan dengan Enter)
    const linesToPush = linesRemaining - footerHeight;
    if (linesToPush > 0) {
        for (let k = 0; k < linesToPush; k++) addLine("\n");
    } else {
        addLine("\n"); // Safety margin minimal 1
    }

    // 5. Cetak Cap Status (Jika ada, misal LUNAS/BELUM LUNAS)
    if (capStatus) {
        // Centerkan Cap
        addLine(padBold(capStatus, TOTAL_WIDTH, 'center') + "\n");
    }

    // 6. Cetak Tanda Tangan (Rapi & Center)
    const wTTD = 38; 
    const spacerTTD = " ".repeat(TOTAL_WIDTH - (wTTD * 2)); // Sisa ruang di tengah
    
    // Baris 1: Label
    addLine(pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n");
    
    // Baris 2-3: Spasi TTD
    addLine("\n\n"); 
    
    // Baris 4: Nama (Upper Case & Dipotong biar tidak hancur)
    const customerNameDisp = namaPelanggan.substring(0, 30).toUpperCase();
    addLine(pad("( Admin )", wTTD, 'center') + spacerTTD + pad(`( ${customerNameDisp} )`, wTTD, 'center'));
};


// ==========================================
// 2. GENERATE NOTA TRANSAKSI (INVOICE)
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

    const totalQtyBuku = dataItems.reduce((acc, curr) => acc + (Number(curr.qty || curr.jumlah || 0)), 0);
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);
    const statusLunas = sisaTagihan <= 0 ? "LUNAS" : "BELUM LUNAS";

    // --- HEADER ---
    addLine(padBold(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    const judulDokumen = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    addLine(padBold(judulDokumen, TOTAL_WIDTH, 'center') + "\n"); 
    addLine(HR);

    const idDokumen = transaksi.id || '-';
    const namaPelanggan = transaksi.namaCustomer || 'Umum';
    const tanggal = formatDate(transaksi.tanggal);

    // Baris Info
    const txtKiri1 = "No. Trans : " + idDokumen;
    const txtKanan1 = "Tanggal : " + tanggal;
    const gap1 = TOTAL_WIDTH - (txtKiri1.length + txtKanan1.length);
    addLine(txtKiri1 + " ".repeat(gap1 > 0 ? gap1 : 0) + txtKanan1 + "\n");
    
    const lblCust = "Customer  : "; 
    const valCust = namaPelanggan.substring(0, 50); 
    addLine(lblCust + BOLD_START + valCust + BOLD_END + "\n"); 
    addLine(HR);

    // Tabel Header
    const wNo = 3; const wQty = 7; const wHrg = 15; const wDisc = 7; const wSub = 17; 
    const wItem = TOTAL_WIDTH - (wNo + wQty + wHrg + wDisc + wSub); 
    addLine(padBold("No", wNo) + padBold("Judul Buku", wItem) + padBold("Qty", wQty, 'center') + 
            padBold("Harga", wHrg, 'right') + padBold("Disc", wDisc, 'right') + padBold("Subtotal", wSub, 'right') + "\n");
    addLine(HR);

    // Items
    dataItems.forEach((item, i) => {
        const harga = Number(item.harga || item.hargaSatuan || 0);
        const qty = Number(item.qty || item.jumlah || 0);
        const subtotal = Number(item.subtotal || 0);
        let fullTitle = (item.judul || item.productName || '-');
        let safeLen = wItem - 1; 
        let line1 = fullTitle.substring(0, safeLen).trim();
        let line2 = fullTitle.length > safeLen ? fullTitle.substring(safeLen, safeLen * 2).trim() : "";

        addLine(pad((i + 1).toString(), wNo) + pad(line1, wItem) + pad(qty.toString(), wQty, 'center') + 
                pad(formatNumber(harga), wHrg, 'right') + pad("-", wDisc, 'right') + pad(formatNumber(subtotal), wSub, 'right') + "\n");
        if (line2) addLine(pad("", wNo) + pad(line2, wItem) + "\n");
    });

    // Summary
    addLine(HR);
    const totalBruto = Number(transaksi.totalBruto || 0);
    const totalDiskon = Number(transaksi.totalDiskon || 0);
    const totalBiayaLain = Number(transaksi.totalBiayaLain || 0);
    const totalNetto = Number(transaksi.totalNetto || 0);
    const totalBayar = Number(transaksi.totalBayar || 0);
    
    const wF1 = 30; const wF2 = 26; const wF3 = 40; 
    const renderRowAligned = (l1, v1, l2, v2, l3, v3, bold1, bold2, bold3) => {
        let str = "";
        if (l1) { const c = `${pad(l1, 8)}: ${v1}`; str += bold1 ? padBold(c, wF1, 'left') : pad(c, wF1, 'left'); } else str += pad("", wF1);
        if (l2) { const c = `${pad(l2, 6)}: ${v2}`; str += bold2 ? padBold(c, wF2, 'left') : pad(c, wF2, 'left'); } else str += pad("", wF2);
        if (l3) { const c = `${pad(l3, 8)}: ${v3}`; str += bold3 ? padBold(c, wF3, 'left') : pad(c, wF3, 'left'); } else str += pad("", wF3);
        return str + "\n";
    };

    addLine(pad(`Total Buku : ${formatNumber(totalQtyBuku)} pcs`, TOTAL_WIDTH, 'right') + "\n");
    addLine(renderRowAligned("Bruto", formatNumber(totalBruto), "Disc", formatNumber(totalDiskon), "Biaya", formatNumber(totalBiayaLain), false, false, false));
    addLine(renderRowAligned("Tagihan", formatNumber(totalNetto), "Bayar", formatNumber(totalBayar), "Sisa", formatNumber(sisaTagihan), true, true, true));
    
    // --- FOOTER DENGAN PUSH TO BOTTOM ---
    const capStatus = `*** STATUS: ${statusLunas} ***`;
    printFooterWithPush(addLine, currentLine, TARGET_LINES, namaPelanggan, capStatus);

    return txt;
};

// ==========================================
// 3. GENERATE NOTA PEMBAYARAN (CICILAN)
// ==========================================
export const generateNotaPembayaranText = (payment, allocations) => {
    const dataItems = (allocations && Array.isArray(allocations) && allocations.length > 0) ? allocations : [{ invoiceId: '-', amount: Number(payment.totalBayar || 0), keterangan: payment.keterangan }];
    const TARGET_LINES = 29;
    let currentLine = 0;
    let txt = "";

    const addLine = (str) => {
        txt += str;
        const linesInStr = (str.match(/\n/g) || []).length;
        currentLine += linesInStr;
    };

    // Header
    addLine(padBold(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    addLine(padBold("NOTA PEMBAYARAN", TOTAL_WIDTH, 'center') + "\n"); 
    addLine(HR);

    const idDokumen = payment.id || '-';
    const namaPelanggan = payment.namaCustomer || 'Umum';
    const tanggal = formatDate(payment.tanggal);

    const txtKiri = "No. Bayar : " + idDokumen;
    const txtKanan = "Tanggal : " + tanggal;
    const gap = TOTAL_WIDTH - (txtKiri.length + txtKanan.length);
    addLine(txtKiri + " ".repeat(gap > 0 ? gap : 0) + txtKanan + "\n");
    
    addLine("Customer  : " + BOLD_START + pad(namaPelanggan.substring(0, 50), 50) + BOLD_END + "\n"); 
    addLine(HR);
    
    // Table Header
    const wNo = 4; const wInv = 22; const wJml = 20; const spc = " ";
    const wKet = TOTAL_WIDTH - (wNo + wInv + wJml + 3); 
    addLine(padBold("No", wNo) + spc + padBold("No. Invoice", wInv) + spc + padBold("Keterangan", wKet) + spc + padBold("Jumlah (Rp)", wJml, 'right') + "\n");
    addLine(HR);

    // Items
    let calculatedTotal = 0;
    dataItems.forEach((item, i) => {
        const amount = Number(item.amount || 0);
        calculatedTotal += amount;
        const ket = item.keterangan || payment.keterangan || '-';
        addLine(pad((i+1).toString(), wNo) + spc + pad(item.invoiceId || '-', wInv) + spc + pad(ket.substring(0, wKet), wKet) + spc + pad(formatNumber(amount), wJml, 'right') + "\n");
    });

    // Total
    addLine(HR);
    const finalTotal = Number(payment.totalBayar) || calculatedTotal;
    const labelTotal = "TOTAL PEMBAYARAN:";
    const valueTotal = formatNumber(finalTotal);
    addLine(padBold(labelTotal, TOTAL_WIDTH - wJml - 2, 'right') + "  " + padBold(valueTotal, wJml, 'right') + "\n");

    // --- FOOTER PUSH ---
    // Tidak ada cap status untuk pembayaran cicilan (opsional)
    printFooterWithPush(addLine, currentLine, TARGET_LINES, namaPelanggan, "");

    return txt;
};

// ==========================================
// 4. GENERATE NOTA RETUR PENJUALAN
// ==========================================
export const generateReturText = (returData, items) => {
    const dataItems = (items && items.length > 0) ? items : [];
    const TARGET_LINES = 29;
    let currentLine = 0;
    let txt = "";

    const addLine = (str) => {
        txt += str;
        const linesInStr = (str.match(/\n/g) || []).length;
        currentLine += linesInStr;
    };

    // Header
    addLine(padBold(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    addLine(padBold("NOTA RETUR PENJUALAN", TOTAL_WIDTH, 'center') + "\n");
    addLine(HR);

    const idDokumen = returData.id || '-';
    const refInvoice = returData.invoiceId || '-';
    const namaPelanggan = returData.namaCustomer || 'Umum';
    const tanggal = formatDate(returData.tanggal);

    const txtKiri1 = "No. Retur : " + idDokumen;
    const txtKanan1 = "Tanggal : " + tanggal;
    const gap1 = TOTAL_WIDTH - (txtKiri1.length + txtKanan1.length);
    addLine(txtKiri1 + " ".repeat(gap1 > 0 ? gap1 : 0) + txtKanan1 + "\n");

    const txtKiri2 = "Customer  : " + namaPelanggan.substring(0, 40);
    const txtKanan2 = "Ref. Inv: " + refInvoice;
    const gap2 = TOTAL_WIDTH - (txtKiri2.length + txtKanan2.length);
    addLine(txtKiri2 + " ".repeat(gap2 > 0 ? gap2 : 0) + txtKanan2 + "\n");
    addLine(HR);

    // Table Header
    const wNo = 4; const wQty = 6; const wHrg = 15; const wSub = 18; 
    const wItem = TOTAL_WIDTH - (wNo + wQty + wHrg + wSub);
    addLine(padBold("No", wNo) + padBold("Barang / Judul Buku", wItem) + padBold("Qty", wQty, 'center') + padBold("Harga", wHrg, 'right') + padBold("Subtotal", wSub, 'right') + "\n");
    addLine(HR);

    // Items
    if (dataItems.length === 0) {
        addLine(pad("1", wNo) + pad("Retur Manual", wItem) + pad("-", wQty, 'center') + pad("-", wHrg, 'right') + pad(formatNumber(returData.totalRetur), wSub, 'right') + "\n");
    } else {
        dataItems.forEach((item, i) => {
            const harga = Number(item.harga || 0);
            const qty = Number(item.qty || 0);
            const subtotal = Number(item.subtotal || (qty * harga));
            let fullTitle = (item.judul || item.productName || '-');
            let line1 = fullTitle.substring(0, wItem).trim();
            addLine(pad((i + 1).toString(), wNo) + pad(line1, wItem) + pad(formatNumber(qty), wQty, 'center') + pad(formatNumber(harga), wHrg, 'right') + pad(formatNumber(subtotal), wSub, 'right') + "\n");
        });
    }

    // Footer Total
    addLine(HR);
    const totalQtyRetur = dataItems.reduce((acc, curr) => acc + (Number(curr.qty || 0)), 0);
    addLine(pad(`Total Buku Retur: ${formatNumber(totalQtyRetur)} pcs`, TOTAL_WIDTH, 'left') + "\n");

    const totalRetur = Number(returData.totalRetur || 0);
    const totalLine = padBold("TOTAL UANG KEMBALI :", TOTAL_WIDTH - 25, 'right') + padBold(formatNumber(totalRetur), 25, 'right');
    addLine(totalLine + "\n");

    // --- FOOTER PUSH ---
    printFooterWithPush(addLine, currentLine, TARGET_LINES, namaPelanggan, "");

    return txt;
};

// ==========================================
// 5. GENERATE NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    const items = [{ keterangan: data.keterangan || '-', amount: Number(data.totalBayar || 0) }];
    const TARGET_LINES = 29;
    let currentLine = 0;
    let txt = "";

    const addLine = (str) => {
        txt += str;
        const linesInStr = (str.match(/\n/g) || []).length;
        currentLine += linesInStr;
    };

    // Header
    addLine(padBold(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n");
    addLine(padBold("NOTA NON-FAKTUR", TOTAL_WIDTH, 'center') + "\n"); 
    addLine(HR);

    const idDokumen = data.id || '-';
    const namaPelanggan = data.namaCustomer || 'Umum';
    const tanggal = formatDate(data.tanggal);

    const txtKiri = "No. Ref   : " + idDokumen;
    const txtKanan = "Tanggal : " + tanggal;
    const gap = TOTAL_WIDTH - (txtKiri.length + txtKanan.length);
    addLine(txtKiri + " ".repeat(gap > 0 ? gap : 0) + txtKanan + "\n");
    
    addLine("Customer  : " + BOLD_START + pad(namaPelanggan.substring(0, 50), 50) + BOLD_END + "\n");
    addLine(HR);
    
    // Table Header
    const wNo = 4; const wKet = 69; const wJml = 21; const spc = " ";
    addLine(padBold("No", wNo) + spc + padBold("Keterangan", wKet) + spc + padBold("Jumlah (Rp)", wJml, 'right') + "\n");
    addLine(HR);

    // Items
    let calculatedTotal = 0;
    items.forEach((item, i) => {
        const amount = Number(item.amount || 0);
        calculatedTotal += amount;
        addLine(pad((i+1).toString(), wNo) + spc + pad(item.keterangan.substring(0, wKet), wKet) + spc + pad(formatNumber(amount), wJml, 'right') + "\n");
    });

    // Total
    addLine(HR);
    const finalTotal = Number(data.totalBayar) || calculatedTotal;
    addLine(padBold("TOTAL BAYAR:", TOTAL_WIDTH - wJml - 2, 'right') + "  " + padBold(formatNumber(finalTotal), wJml, 'right') + "\n");

    // --- FOOTER PUSH ---
    printFooterWithPush(addLine, currentLine, TARGET_LINES, namaPelanggan, "");

    return txt;
};