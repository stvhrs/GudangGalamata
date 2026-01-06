// src/utils/notaPembayaranText.js

// --- KONFIGURASI DAN HELPER ---

// 1. Definisi Konstanta BOLD (Penting agar tidak Error)
// Catatan: Jika menggunakan window.print() browser, kode ESC/P (\x1B...) tidak akan membuat bold visual,
// tapi diperlukan jika string ini dikirim raw ke printer Dot Matrix.
// Jika ingin preview rapi di browser tanpa merusak spasi, biarkan string kosong atau gunakan kode ESC.
const BOLD_ON = "";  // Bisa diganti "\x1B\x45\x01" untuk ESC/P
const BOLD_OFF = ""; // Bisa diganti "\x1B\x45\x00" untuk ESC/P

const TOTAL_WIDTH = 96; // Lebar karakter kertas (biasanya 96 untuk 9.5 inch continuous form condensed)
const FF = "\x0C";      // Form Feed (Ganti Halaman)
const HR = "-".repeat(TOTAL_WIDTH) + "\n";

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391"
};

// 2. Helper Formatter
const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);

const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    // Menggunakan native Date agar tidak perlu dependensi dayjs di file util ini
    return new Date(timestamp).toLocaleDateString('id-ID', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute:'2-digit' 
    }).replace(/\./g, ':'); // fix format waktu indo
};

// 3. Helper Padding (Penting untuk kerapian)
const pad = (str, len, align = 'left') => {
    let s = String(str || '').substring(0, len); 
    if (align === 'left') return s.padEnd(len, ' ');
    if (align === 'right') return s.padStart(len, ' ');
    
    // Center logic
    const leftPad = Math.floor((len - s.length) / 2);
    // Pastikan tidak negatif
    if (leftPad < 0) return s;
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

// ==========================================
// FUNGSI UTAMA: GENERATE NOTA PEMBAYARAN
// ==========================================
export const generateNotaPembayaranText = (payment, allocations) => {
    let items = [];
    // Validasi data alokasi
    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
        items = allocations;
    } else {
        // Fallback jika tidak ada detail alokasi
        items = [{
            invoiceId: '-',
            amount: Number(payment.totalBayar || 0),
            keterangan: payment.keterangan
        }];
    }

    const TARGET_LINES_PER_PAGE = 29; // Sesuaikan dengan tinggi kertas (biasanya 29 baris untuk setengah kuarto/continuous)
    const FIXED_USED_LINES = 16;      // Jumlah baris header + footer
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
        txt += pad(`NOTA PEMBAYARAN (Hal ${page + 1}/${totalPages})`, TOTAL_WIDTH, 'center') + "\n"; 
        txt += HR;

        const idDokumen = payment.id || '-';
        const namaPelanggan = payment.namaCustomer || 'Umum';
        const tanggal = formatDate(payment.tanggal);

        const lblBayar = "No. Bayar : ";
        const lblTgl = "Tanggal : ";
        const widthInfoRight = TOTAL_WIDTH - (lblBayar.length + 35); 

        txt += lblBayar + pad(idDokumen, 35) + pad(lblTgl + tanggal, widthInfoRight, 'right') + "\n";
        
        // CUSTOMER LINE
        txt += "Customer  : " + BOLD_ON + pad(namaPelanggan.substring(0, 70), 70) + BOLD_OFF + "\n"; 
        txt += HR;
        
        // TABLE HEADER
        const wNo = 4; const wInv = 22; const wJml = 20; const spc = " ";
        const wKet = TOTAL_WIDTH - (wNo + wInv + wJml + 3); 

        txt += pad("No", wNo) + spc + 
               pad("No. Invoice", wInv) + spc + 
               pad("Keterangan", wKet) + spc + 
               pad("Jumlah (Rp)", wJml, 'right') + "\n";
        txt += HR;

        // --- BODY (ITEMS) ---
        let bodyLinesUsed = 0;
        pageItems.forEach((item, i) => {
            const globalIndex = startIdx + i + 1;
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            
            // Handle Keterangan: ambil dari item, atau fallback ke payment desc
            const ket = item.keterangan || payment.keterangan || '-';

            txt += pad(globalIndex.toString(), wNo) + spc +
                   pad(item.invoiceId || '-', wInv) + spc +
                   pad(ket.substring(0, wKet), wKet) + spc +
                   pad(formatNumber(amount), wJml, 'right') + "\n";
            
            bodyLinesUsed++;
        });

        // FILLER LINES (Agar footer selalu di bawah)
        const linesToFill = AVAILABLE_BODY_LINES - bodyLinesUsed;
        if (linesToFill > 0) {
            for (let k = 0; k < linesToFill; k++) txt += "\n"; 
        }

        txt += HR;
        
        // --- FOOTER ---
        if (isLastPage) {
            const finalTotal = Number(payment.totalBayar) || calculatedTotal;
            const labelTotal = "TOTAL PEMBAYARAN:";
            const valueTotal = formatNumber(finalTotal);
            const widthLabel = TOTAL_WIDTH - wJml - 1; 

            // TOTAL LINE
            txt += BOLD_ON + pad(labelTotal, widthLabel, 'right') + " " + pad(valueTotal, wJml, 'right') + BOLD_OFF + "\n";
            
            txt += "\n"; 
            const spacerTTD = " ".repeat(20); 
            const wTTD = 38; 
            
            txt += pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n";
            txt += "\n\n"; 
            txt += pad("(________________)", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center') + "\n";
        
        } else {
            txt += pad("... BERSAMBUNG KE HALAMAN BERIKUTNYA ...", TOTAL_WIDTH, 'center') + "\n";
            txt += "\n\n\n\n"; 
        }

        if (!isLastPage) txt += FF; 
    }
    return txt;
};

// ==========================================
// FUNGSI SEKUNDER: GENERATE NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    // Bungkus data tunggal menjadi array item
    const items = [{
        keterangan: data.keterangan || '-',
        amount: Number(data.totalBayar || 0)
    }];

    const TARGET_LINES_PER_PAGE = 29; 
    const FIXED_USED_LINES = 16;
    const AVAILABLE_BODY_LINES = TARGET_LINES_PER_PAGE - FIXED_USED_LINES;
    const totalPages = Math.ceil(items.length / AVAILABLE_BODY_LINES) || 1;
    
    let txt = "";
    let calculatedTotal = 0;

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = page === totalPages - 1;
        const startIdx = page * AVAILABLE_BODY_LINES;
        const pageItems = items.slice(startIdx, startIdx + AVAILABLE_BODY_LINES);

        txt += pad(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n";
        txt += pad(`NOTA NON-FAKTUR (Hal ${page + 1}/${totalPages})`, TOTAL_WIDTH, 'center') + "\n"; 
        txt += HR;

        const idDokumen = data.id || '-';
        const namaPelanggan = data.namaCustomer || 'Umum';
        const tanggal = formatDate(data.tanggal);

        const lblRef = "No. Ref   : ";
        const lblTgl = "Tanggal : ";
        
        txt += lblRef + pad(idDokumen, 35) + pad(lblTgl + tanggal, TOTAL_WIDTH - (lblRef.length + 35), 'right') + "\n";
        
        txt += "Customer  : " + BOLD_ON + pad(namaPelanggan.substring(0, 70), 70) + BOLD_OFF + "\n";
        txt += HR;
        
        const wNo = 4; const wKet = 69; const wJml = 21; const spc = " ";

        txt += pad("No", wNo) + spc + 
               pad("Keterangan", wKet) + spc + 
               pad("Jumlah (Rp)", wJml, 'right') + "\n";
        txt += HR;

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

        const linesToFill = AVAILABLE_BODY_LINES - bodyLinesUsed;
        if (linesToFill > 0) {
            for (let k = 0; k < linesToFill; k++) txt += "\n"; 
        }

        txt += HR;
        
        if (isLastPage) {
            const finalTotal = Number(data.totalBayar) || calculatedTotal;
            const labelTotal = "TOTAL BAYAR:";
            const valueTotal = formatNumber(finalTotal);
            
            txt += BOLD_ON + pad(labelTotal, TOTAL_WIDTH - wJml - 2, 'right') + "  " + pad(valueTotal, wJml, 'right') + BOLD_OFF + "\n";
            
            txt += "\n"; 
            const spacerTTD = " ".repeat(20); 
            const wTTD = 38; 
            
            txt += pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n";
            txt += "\n\n"; 
            txt += pad("( Admin )", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center') + "\n";
        
        } else {
            txt += pad("... BERSAMBUNG ...", TOTAL_WIDTH, 'center') + "\n";
            txt += "\n\n\n\n"; 
        }

        if (!isLastPage) txt += FF; 
    }

    return txt;
};