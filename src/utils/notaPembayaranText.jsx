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
    // Center logic
    const leftPad = Math.floor((len - s.length) / 2);
    return s.padStart(s.length + leftPad, ' ').padEnd(len, ' ');
};

// --- KONFIGURASI KERTAS 9.5 INCH (SAMA DENGAN TRANSAKSI) ---
const TOTAL_WIDTH = 96;
const HR = "-".repeat(TOTAL_WIDTH) + "\n";
const FF = "\x0C"; // Form Feed untuk pindah halaman

export const generateNotaPembayaranText = (payment, allocations) => {
    // 1. SETUP ITEM
    let items = [];
    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
        items = allocations;
    } else {
        items = [{
            invoiceId: '-',
            amount: Number(payment.totalBayar || 0),
            keterangan: payment.keterangan
        }];
    }

    // 2. KONFIGURASI HALAMAN
    // Target baris per halaman agar pas di kertas continuous form 5.5 inch (bagi 2 dari 11 inch)
    const TARGET_LINES_PER_PAGE = 29; 
    const FIXED_USED_LINES = 9 + 7; // Header (~9 baris) + Footer (~7 baris)
    const AVAILABLE_BODY_LINES = TARGET_LINES_PER_PAGE - FIXED_USED_LINES;
    const totalPages = Math.ceil(items.length / AVAILABLE_BODY_LINES);
    
    let txt = "";
    let calculatedTotal = 0;

    for (let page = 0; page < totalPages; page++) {
        const isLastPage = page === totalPages - 1;
        const startIdx = page * AVAILABLE_BODY_LINES;
        const pageItems = items.slice(startIdx, startIdx + AVAILABLE_BODY_LINES);

        // --- A. HEADER (SAMA DENGAN TRANSAKSI) ---
        txt += pad(companyInfo.nama, TOTAL_WIDTH, 'center') + "\n";
        txt += pad(`NOTA PEMBAYARAN (Hal ${page + 1}/${totalPages})`, TOTAL_WIDTH, 'center') + "\n"; 
        txt += HR;

        const idDokumen = payment.id || '-';
        const namaPelanggan = payment.namaCustomer || 'Umum';
        const tanggal = formatDate(payment.tanggal);

        // Baris Info: No. Bayar di Kiri, Tanggal di Kanan
        const lblBayar = "No. Bayar : ";
        const lblTgl = "Tanggal : ";
        // Lebar sisa untuk tanggal
        const widthInfoRight = TOTAL_WIDTH - (lblBayar.length + 35); 

        txt += lblBayar + pad(idDokumen, 35) + pad(lblTgl + tanggal, widthInfoRight, 'right') + "\n";
        txt += "Customer  : " + pad(namaPelanggan.substring(0, 70), 70) + "\n"; 
        txt += HR;
        
        // --- B. TABEL HEADER (Setting Lebar agar pas 96) ---
        // Perhitungan:
        // No (4) + spasi(1) + Invoice (22) + spasi(1) + Jumlah (20) + spasi(1)
        // Sisa untuk Keterangan = 96 - (4+1 + 22+1 + 20+1) = 47
        
        const wNo = 4;
        const wInv = 22;
        const wJml = 20;
        const spc = " ";
        const wKet = TOTAL_WIDTH - (wNo + wInv + wJml + 3); // 47 Char

        txt += pad("No", wNo) + spc + 
               pad("No. Invoice", wInv) + spc + 
               pad("Keterangan", wKet) + spc + 
               pad("Jumlah (Rp)", wJml, 'right') + "\n";
        txt += HR;

        // --- C. BODY ITEMS ---
        let bodyLinesUsed = 0;
        pageItems.forEach((item, i) => {
            const globalIndex = startIdx + i + 1;
            const amount = Number(item.amount || 0);
            calculatedTotal += amount;
            
            // Render Baris
            txt += pad(globalIndex.toString(), wNo) + spc +
                   pad(item.invoiceId || '-', wInv) + spc +
                   pad((item.keterangan || payment.keterangan || '-').substring(0, wKet), wKet) + spc +
                   pad(formatNumber(amount), wJml, 'right') + "\n";
            
            bodyLinesUsed++;
        });

        // --- D. FILLER (Agar footer turun ke bawah) ---
        const linesToFill = AVAILABLE_BODY_LINES - bodyLinesUsed;
        if (linesToFill > 0) {
            for (let k = 0; k < linesToFill; k++) txt += "\n"; 
        }

        // --- E. FOOTER ---
        txt += HR;
        
        if (isLastPage) {
            const finalTotal = Number(payment.totalBayar) || calculatedTotal;
            
            // Total diposisikan lurus dengan kolom Jumlah (Kanan)
            const labelTotal = "TOTAL PEMBAYARAN:";
            const valueTotal = formatNumber(finalTotal);
            
            // Label di-pad ke kanan sisa lebar, Value di-pad sesuai lebar kolom Jumlah
            const widthLabel = TOTAL_WIDTH - wJml - 1; // -1 untuk spasi pemisah
            txt += pad(labelTotal, widthLabel, 'right') + " " + pad(valueTotal, wJml, 'right') + "\n";
            
            // --- TANDA TANGAN (SAMA DENGAN TRANSAKSI) ---
            txt += "\n"; 
            const spacerTTD = " ".repeat(20); // Jarak antar TTD
            const wTTD = 38; // Lebar kotak TTD
            
            txt += pad("Hormat Kami,", wTTD, 'center') + spacerTTD + pad("Penerima,", wTTD, 'center') + "\n";
            txt += "\n\n"; // Space untuk tanda tangan
            txt += pad("(________________)", wTTD, 'center') + spacerTTD + pad(`( ${namaPelanggan.substring(0, 30)} )`, wTTD, 'center') + "\n";
        
        } else {
            // Halaman bersambung
            txt += pad("... BERSAMBUNG KE HALAMAN BERIKUTNYA ...", TOTAL_WIDTH, 'center') + "\n";
            // Isi sisa baris footer agar form feed pas
            txt += "\n\n\n\n"; 
        }

        if (!isLastPage) txt += FF; 
    }

    return txt;
};