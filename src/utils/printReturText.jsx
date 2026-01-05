// ==========================================
// 1. CONFIG & HELPERS (WAJIB ADA DI PALING ATAS)
// ==========================================

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

const TOTAL_WIDTH = 96; // Lebar karakter printer (Mode Elite 12 CPI / Condensed)
const HR = "-".repeat(TOTAL_WIDTH) + "\n";
const FF = "\x0C"; // Form Feed (Page Break)

const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => {
    if(!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('id-ID', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute:'2-digit' 
    });
};

// --- FUNGSI PADDING (WAJIB ADA) ---
const pad = (str, len, align = 'left') => {
    let s = String(str || '').substring(0, len); 
    if (align === 'left') return s.padEnd(len, ' ');
    if (align === 'right') return s.padStart(len, ' ');
    
    // Center logic
    const leftPad = Math.floor((len - s.length) / 2);
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

// ==========================================
// 2. CODE: NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    // A. SETUP ITEM
    const items = [{
        keterangan: data.keterangan || '-',
        amount: Number(data.totalBayar || 0)
    }];

    // B. KONFIGURASI HALAMAN
    const TARGET_LINES_PER_PAGE = 29; 
    const FIXED_USED_LINES = 9 + 7; // Header + Footer space
    const AVAILABLE_BODY_LINES = TARGET_LINES_PER_PAGE - FIXED_USED_LINES;
    const totalPages = Math.ceil(items.length / AVAILABLE_BODY_LINES) || 1;
    
    let txt = "";
    let calculatedTotal = 0;

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = page === totalPages - 1;
        const startIdx = page * AVAILABLE_BODY_LINES;
        const pageItems = items.slice(startIdx, startIdx + AVAILABLE_BODY_LINES);

        // --- HEADER ---
        txt += pad(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n";
        txt += pad(`NOTA NON-FAKTUR (Hal ${page + 1}/${totalPages})`, TOTAL_WIDTH, 'center') + "\n"; 
        txt += HR;

        const idDokumen = data.id || '-';
        const namaPelanggan = data.namaCustomer || 'Umum';
        const tanggal = formatDate(data.tanggal);

        const lblRef = "No. Ref   : ";
        const lblTgl = "Tanggal : ";
        
        // Layout info header
        txt += lblRef + pad(idDokumen, 35) + pad(lblTgl + tanggal, TOTAL_WIDTH - (lblRef.length + 35), 'right') + "\n";
        txt += "Customer  : " + pad(namaPelanggan.substring(0, 70), 70) + "\n";
        txt += HR;
        
        // --- TABEL HEADER ---
        const wNo = 4;
        const wKet = 69; 
        const wJml = 21;
        const spc = " ";

        txt += pad("No", wNo) + spc + 
               pad("Keterangan", wKet) + spc + 
               pad("Jumlah (Rp)", wJml, 'right') + "\n";
        txt += HR;

        // --- BODY ITEMS ---
        let bodyLinesUsed = 0;
        pageItems.forEach((item, i) => {
            const globalIndex = startIdx + i + 1;
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            
            txt += pad(globalIndex.toString(), wNo) + spc +
                   pad(item.keterangan.substring(0, wKet), wKet) + spc +
                   pad(formatNumber(amount), wJml, 'right') + "\n";
            
            bodyLinesUsed++;
        });

        // --- FILLER ---
        const linesToFill = AVAILABLE_BODY_LINES - bodyLinesUsed;
        if (linesToFill > 0) {
            for (let k = 0; k < linesToFill; k++) txt += "\n"; 
        }

        // --- FOOTER ---
        txt += HR;
        
        if (isLastPage) {
            const finalTotal = Number(data.totalBayar) || calculatedTotal;
            
            const labelTotal = "TOTAL BAYAR:";
            const valueTotal = formatNumber(finalTotal);
            
            // Total di kanan
            txt += pad(labelTotal, TOTAL_WIDTH - wJml - 2, 'right') + "  " + pad(valueTotal, wJml, 'right') + "\n";
            
            // --- TANDA TANGAN (Style: Pembayaran) ---
            txt += "\n"; 
            const spacerTTD = " ".repeat(20); 
            const wTTD = 38; 
            
            txt += pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n";
            txt += "\n\n"; // Space TTD
            txt += pad("( Admin )", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center') + "\n";
        
        } else {
            txt += pad("... BERSAMBUNG ...", TOTAL_WIDTH, 'center') + "\n";
            txt += "\n\n\n\n"; 
        }

        if (!isLastPage) txt += FF; 
    }

    return txt;
};

// ==========================================
// 3. CODE: NOTA RETUR
// ==========================================
export const generateReturText = (returData, items) => {
    let txt = "";

    // --- HEADER ---
    txt += pad(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n";
    txt += pad("NOTA RETUR PENJUALAN", TOTAL_WIDTH, 'center') + "\n";
    txt += HR;

    const idDokumen = returData.id || '-';
    const refInvoice = returData.invoiceId || '-';
    const namaPelanggan = returData.namaCustomer || 'Umum';
    const tanggal = formatDate(returData.tanggal);

    // Baris Info 1
    const lblNo = "No. Retur : ";
    const lblTgl = "Tanggal : ";
    txt += lblNo + pad(idDokumen, 35) + pad(lblTgl + tanggal, TOTAL_WIDTH - (lblNo.length + 35), 'right') + "\n";

    // Baris Info 2
    const lblCust = "Customer  : ";
    const lblRef = "Ref. Inv: ";
    const wCust = 50; 
    txt += lblCust + pad(namaPelanggan.substring(0, wCust), wCust) + 
           pad(lblRef + refInvoice, TOTAL_WIDTH - (lblCust.length + wCust), 'right') + "\n";
    
    txt += HR;

    // --- TABEL HEADER ---
    const wNo = 4;   
    const wQty = 6;  
    const wHrg = 15; 
    const wSub = 18; 
    const wItem = TOTAL_WIDTH - (wNo + wQty + wHrg + wSub);

    txt += pad("No", wNo) +
           pad("Barang / Judul Buku", wItem) +
           pad("Qty", wQty, 'center') +
           pad("Harga", wHrg, 'right') +
           pad("Subtotal", wSub, 'right') + "\n";
    txt += HR;

    // --- BODY ITEMS ---
    const dataItems = (items && items.length > 0) ? items : [];

    if (dataItems.length === 0) {
        // Fallback jika tidak ada item detail
        txt += pad("1", wNo) + 
               pad("Retur Manual (Lihat Total)", wItem) + 
               pad("-", wQty, 'center') + 
               pad("-", wHrg, 'right') + 
               pad(formatNumber(returData.totalRetur), wSub, 'right') + "\n";
    } else {
        dataItems.forEach((item, i) => {
            const harga = Number(item.harga || 0);
            const qty = Number(item.qty || 0);
            const subtotal = Number(item.subtotal || (qty * harga));

            let fullTitle = (item.judul || item.productName || '-');
            let line1 = fullTitle.substring(0, wItem).trim();
            let line2 = "";

            if (fullTitle.length > wItem) {
                line2 = fullTitle.substring(wItem, wItem * 2).trim();
            }

            // Print Baris 1
            txt += pad((i + 1).toString(), wNo) +
                   pad(line1, wItem) +
                   pad(formatNumber(qty), wQty, 'center') +
                   pad(formatNumber(harga), wHrg, 'right') +
                   pad(formatNumber(subtotal), wSub, 'right') + "\n";

            // Print Baris 2 (jika judul panjang)
            if (line2) {
                txt += pad("", wNo) + pad(line2, wItem) + "\n";
            }
        });
    }

    // --- FOOTER ---
    txt += HR;

    const totalRetur = Number(returData.totalRetur || 0);
    // Note: Keterangan sudah dihapus

    const labelTotal = "TOTAL RETUR :";
    const valTotal = formatNumber(totalRetur);
    
    // Layout Total align kanan
    const rightMargin = wSub + 5; 
    const totalLine = pad(labelTotal, TOTAL_WIDTH - rightMargin, 'right') + 
                      pad(valTotal, rightMargin, 'right');
    
    txt += totalLine + "\n";

    // --- TANDA TANGAN (Style: Pembayaran) ---
    txt += "\n"; 
    const spacerTTD = " ".repeat(20); 
    const wTTD = 38; 
    
    txt += pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n";
    txt += "\n\n"; // Space TTD
    txt += pad("( Admin )", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center') + "\n";

    return txt;
};