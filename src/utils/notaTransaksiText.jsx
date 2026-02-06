// src/utils/invoiceGenerators.js

export const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
    hp: "0882-0069-05391",
};

// Helper Formatters
export const formatNumber = (value) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(value || 0);
export const formatDate = (timestamp) => {
    if(!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('id-ID', { 
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
};

/**
 * STYLE CONFIGURATION
 * padding-right: 25px (Sekitar 7 huruf agar tidak mepet kanan)
 * box-sizing: border-box (Wajib agar padding tidak membuat layout melebar)
 * width: 100% (Mengambil lebar penuh container)
 */
const MAIN_STYLE = "font-family: 'Verdana', 'Consolas', monospace; font-size: 12px; color: #000; width: 100%; margin: 0; padding-right: 25px; box-sizing: border-box;";

// ==========================================
// 1. GENERATE NOTA TRANSAKSI (INVOICE)
// ==========================================
// --- HELPER SORTING & EKSTRAKSI ---

// ==========================================
// HELPER & LOGIC SORTING
// ==========================================


// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
// ==========================================
// 1. HELPER FUNCTIONS (FULL)
// ==========================================

const romanMap = { 
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 
    'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12 
};

// --- Function 1: Bersihkan String ---
const getCleanClassStr = (item) => {
    let raw = item.kelas; 
    
    // Backup: Cari di judul jika property kelas kosong
    if (!raw) {
        const text = item.judul || item.productName || '';
        const match = text.match(/KELAS\s+([a-z0-9\s]+)/i);
        if (match) raw = match[1]; 
    }

    if (!raw) return ''; 
    return raw.toString().trim().toUpperCase();
};

// --- Function 2: Tentukan Bobot (Grup Atas vs Bawah) ---
const getKelasWeight = (str) => {
    if (!str) return 0; // Paling atas (Umum)

    // Cek apakah formatnya Angka Standar (1-12) atau Romawi (I-XII)
    const isRoman = romanMap[str] !== undefined;
    const isNumber = !isNaN(parseInt(str)) && String(parseInt(str)) === str;

    // Jika Angka/Romawi Standar -> Bobot 100 (Di Bawah)
    if (isRoman) return 100 + romanMap[str]; // 101, 102, dst
    if (isNumber) return 100 + parseInt(str); // 101, 102, dst

    // Jika Huruf/Alphanumeric (A, B1, C, TK, FASE) -> Bobot 0 (Di Atas)
    return 0;
};

// --- Function 3: Tampilan di Tabel (YANG HILANG TADI) ---
const getDisplayKelas = (item) => {
    const val = getCleanClassStr(item);
    
    if (!val) return '-';

    // Cek format standard
    const isRoman = romanMap[val] !== undefined;
    const isNumber = !isNaN(parseInt(val)) && String(parseInt(val)) === val;

    // Jika Angka/Romawi (1, 5, X) -> Tambah kata "KELAS"
    if (isRoman || isNumber) {
        return `KELAS ${val}`;
    }

    // Jika Random (A, B3, C, TK) -> Tampilkan Saja
    return val;
};


// ==========================================
// 2. LOGIC SORTING (Taruh di dalam function generate)
// ==========================================

// ... di dalam function generateReturText / generateTransaksiText ...


// ==========================================
// 1. GENERATE RETUR TEXT
// ==========================================
export const generateReturText = (returData, items) => {
    // CLONE & SORT ITEMS
    const dataItems = items ? [...items] : [];

    dataItems.sort((a, b) => {
        const strA = getCleanClassStr(a);
        const strB = getCleanClassStr(b);
        
        const weightA = getKelasWeight(strA);
        const weightB = getKelasWeight(strB);

        if (Math.floor(weightA / 100) !== Math.floor(weightB / 100)) {
            return weightA - weightB;
        }

        if (weightA >= 100) {
            return weightA - weightB;
        } else {
            return strA.localeCompare(strB, undefined, { 
                numeric: true, 
                sensitivity: 'base' 
            });
        }
    });

    const namaPelanggan = (returData.namaCustomer || 'Umum').toUpperCase();

    // Hitung Total
    let totalQty = 0;
    let totalHargaItems = 0;

    dataItems.forEach(i => {
        totalQty += Number(i.qty || 0);
        totalHargaItems += Number(i.subtotal || 0);
    });

    // --- BAGIAN HEADER & TABEL ITEM ---
    let html = `
    <div style="${MAIN_STYLE}">
        <div style="text-align:center; font-size:16px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:8px;">NOTA RETUR PENJUALAN</div>
        <div style="border-bottom: 1px solid black; margin-bottom: 8px;"></div>

        <table style="width:100%; margin-bottom:15px;">
            <tr>
                <td width="60%">
                    No. Retur: ${returData.id || '-'}<br>
                    Ref. Inv : ${returData.invoiceId || '-'}
                </td>
                <td width="40%" style="text-align: right;">
                    Tanggal: ${formatDate(returData.tanggal)}<br>
                    Customer: <b>${namaPelanggan}</b>
                </td>
            </tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 5px;">
            <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <tr>
                    <td width="5%" style="text-align: center; padding: 5px 0;">No</td>
                    <td width="10%" style="text-align: left; padding: 5px 0;">Kode</td>
                    <td width="40%" style="text-align: left; padding: 5px 0;">Barang</td>
                    <td width="10%" style="text-align: left; padding: 5px 0;">Kelas</td>
                    <td width="8%" style="text-align: left; padding: 5px 0;">-</td>
                    <td width="10%" style="text-align: right; padding: 5px 0;">Qty</td>
                    <td width="15%" style="text-align: right; padding: 5px 0;">Harga</td>
                    <td width="20%" style="text-align: right; padding: 5px 0;">Subtotal</td>
                </tr>
            </thead>
            <tbody>
    `;

    dataItems.forEach((item, i) => {
        const namaBarang = item.judul || item.productName || 'Retur Manual';
        const kelasInfo = getDisplayKelas(item);

        html += `
            <tr>
                <td style="text-align: center; vertical-align: top; padding-top: 3px;">${i + 1}</td>
                <td style="text-align: left; vertical-align: top; padding-top: 3px; word-wrap: break-word;">${item.productId || '-'}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 3px; word-wrap: break-word;">${namaBarang}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 3px;">${kelasInfo}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 3px;">${item.peruntukan || '-'}</td>
                <td style="text-align: right; vertical-align: top; padding-top: 3px;">${item.qty || 0}</td>
                <td style="text-align: right; vertical-align: top; padding-top: 3px;">${formatNumber(item.harga)}</td>
                <td style="text-align: right; vertical-align: top; padding-top: 3px;">${formatNumber(item.subtotal)}</td>
            </tr>
        `;
    });

    // MENAMBAHKAN TFOOT UNTUK TOTAL QTY DI BAWAH KOLOMNYA LANGSUNG
    html += `
            </tbody>
            <tfoot style="border-top: 1px solid black;">
                <tr>
                    <td colspan="5" style="text-align: right; padding-top: 5px; font-weight:bold;">Total Qty :</td>
                    
                    <td style="text-align: right; padding-top: 5px; font-weight:bold;">${totalQty}</td>
                    
                    <td colspan="2"></td>
                </tr>
            </tfoot>
        </table>
        
        <div style="border-top: 1px solid black; margin-bottom: 10px;"></div>

        <table style="width:100%; border-collapse: collapse;">
            <tr style="vertical-align: top;">
                
                <td style="width: 60%; padding-top: 10px;">
                    <table style="width: 100%;">
                        <tr>
                            <td style="text-align: center; width: 50%;">
                                Hormat Kami,<br><br><br><br>( Admin )
                            </td>
                            <td style="text-align: center; width: 50%;">
                                Customer,<br><br><br><br>( ${namaPelanggan.substring(0,15)} )
                            </td>
                        </tr>
                    </table>
                </td>

                <td style="width: 40%;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="text-align: left; padding: 2px;">Total :</td>
                            <td style="text-align: right; padding: 2px;">${formatNumber(totalHargaItems)}</td>
                        </tr>

                        <tr>
                            <td style="text-align: left; padding: 2px;">Total Diskon :</td>
                            <td style="text-align: right; padding: 2px;">${formatNumber(returData.totalDiskon || 0)}</td>
                        </tr>

                        <tr>
                            <td style="text-align: left; padding: 5px; font-weight: bold;">TOTAL Retur :</td>
                            <td style="text-align: right; padding: 5px; font-weight: bold; font-size: 14px;">${formatNumber(returData.totalRetur)}</td>
                        </tr>
                    </table>
                </td>

            </tr>
        </table>
    </div>
    `;
    return html;
};


// ==========================================
// 2. GENERATE TRANSAKSI TEXT
// ==========================================
export const generateTransaksiText = (transaksi, items, type = 'INVOICE') => {
    // CLONE & SORT ITEMS
   const dataItems = items ? [...items] : [];

dataItems.sort((a, b) => {
    const strA = getCleanClassStr(a);
    const strB = getCleanClassStr(b);
    
    const weightA = getKelasWeight(strA);
    const weightB = getKelasWeight(strB);

    // 1. Cek Bedanya Grup (Huruf vs Angka Standard)
    // Grup Huruf (0) akan naik, Grup Angka (100+) akan turun
    if (Math.floor(weightA / 100) !== Math.floor(weightB / 100)) {
        return weightA - weightB;
    }

    // 2. Sorting di dalam Grup
    if (weightA >= 100) {
        // Jika sesama Angka Standard (Kelas 1 vs Kelas 10), pakai bobot angka
        return weightA - weightB;
    } else {
        // Jika sesama Huruf Random (A, A2, B1, C)
        // Gunakan 'numeric: true' agar B2 dianggap lebih kecil dari B10
        return strA.localeCompare(strB, undefined, { 
            numeric: true, 
            sensitivity: 'base' 
        });
    }
});

    const judul = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);
    const namaPelanggan = (transaksi.namaCustomer || 'Umum').toUpperCase();

    let totalQty = 0;
    dataItems.forEach(i => totalQty += Number(i.qty || i.jumlah || 0));

    let html = `
    <div style="${MAIN_STYLE}">
        <table style="width: 100%; margin-bottom: 8px;">
            <tr>
                <td width="60%" style="vertical-align: top;">
                    <div style="font-size:20px;">${companyInfo.nama}</div>
                    <div style="font-size:12px;">${companyInfo.hp}</div>
                </td>
                <td width="40%" style="text-align: right; vertical-align: top;">
                    <div style="font-size:13px; font-weight:bold;">${judul}</div>
                    <div style="font-size:12px;">No: ${transaksi.id || '-'}</div>
                    <div style="font-size:12px;">Tgl: ${formatDate(transaksi.tanggal)}</div>
                </td>
            </tr>
        </table>

        <div style="margin-bottom: 8px; font-size: 12px;">
            Kepada Yth: <b>${namaPelanggan}</b>
        </div>

        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px;">
            <tbody>
                <tr style="border-top: 1px solid black; border-bottom: 1px solid black;">
                    <td width="5%" style="text-align: center; padding: 4px 0;">No</td>
                    <td width="8%" style="text-align: left; padding: 4px 0;">Kode</td>
                    <td width="45%" style="text-align: left; padding: 4px 0;">Nama Barang</td>
                    <td width="15%" style="text-align: left; padding: 4px 0;">Kelas</td>
                    <td width="10%" style="text-align: left; padding: 4px 0;">-</td>
                    
                    <td width="10%" style="text-align: right; padding: 4px 0;">Qty</td>
                    
                    <td width="15%" style="text-align: right; padding: 4px 0;">Harga</td>
                    <td width="15%" style="text-align: right; padding: 4px 0;">Subtotal</td>
                </tr>
    `;

    dataItems.forEach((item, index) => {
        const qty = Number(item.qty || item.jumlah || 0);
        const harga = Number(item.harga || item.hargaSatuan || 0);
        const subtotal = Number(item.subtotal || 0);
        
        const namaBarang = item.judul || item.productName || '-';
        const kelasInfo = getDisplayKelas(item);

        html += `
            <tr>
                <td style="text-align: center; padding: 2px 0; vertical-align: top;">${index + 1}</td>
                <td style="text-align: left; padding: 2px 5px 2px 0; vertical-align: top; word-wrap: break-word;">${item.productId || '-'}</td>
                <td style="text-align: left; padding: 2px 5px 2px 0; vertical-align: top; word-wrap: break-word;">${namaBarang}</td>
                <td style="text-align: left; padding: 2px 5px 2px 0; vertical-align: top; word-wrap: break-word;">${kelasInfo}</td>
                <td style="text-align: left; padding: 2px 5px 2px 0; vertical-align: top; word-wrap: break-word;">${item.peruntukan || '-'}</td>
                
                <td style="text-align: right; padding: 2px 0; vertical-align: top;">${qty}</td>
                
                <td style="text-align: right; padding: 2px 0; vertical-align: top;">${formatNumber(harga)}</td>
                <td style="text-align: right; padding: 2px 0; vertical-align: top;">${formatNumber(subtotal)}</td>
            </tr>
        `;
    });

    html += `
                <tr style="border-top: 1px solid black;">
                    <td colspan="5" style="text-align: right; padding-top: 4px; padding-right:10px;">Total Item:</td>
                    
                    <td style="text-align: right; font-weight:bold; padding-top: 4px;">${totalQty}</td>
                    
                    <td colspan="2"></td>
                </tr>
            </tbody>
        </table>

        <table style="width: 100%; margin-top: 10px; font-size: 12px;">
            <tr>
                <td width="60%" style="vertical-align: top; padding-right: 10px;">
                    <div style="font-size:10px; font-style: italic; margin-bottom: 15px; font-weight:bold;">
                        * Komplain maksimal 3 hari setelah barang diterima.
                    </div>
                    <table style="width: 100%;">
                        <tr>
                            <td style="text-align: left;" width="50%">
                                Hormat Kami,<br><br><br><br><br>( Admin )
                            </td>
                            <td style="text-align: left;" width="50%">
                                Penerima,<br><br><br><br><br>( ${namaPelanggan.substring(0,15)} )
                            </td>
                        </tr>
                    </table>
                </td>

                <td width="40%" style="vertical-align: top;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <tr>
                            <td width="40%" style="text-align: left; padding: 1px 0;">Total</td>
                            <td width="5%"  style="text-align: center; padding: 1px 0;">:</td>
                            <td width="55%" style="text-align: right; padding: 1px 0;">${formatNumber(transaksi.totalBruto)}</td>
                        </tr>
                        <tr>    
                            <td style="text-align: left; padding: 1px 0;">Diskon</td>
                            <td style="text-align: center; padding: 1px 0;">:</td>
                            <td style="text-align: right; padding: 1px 0;">${formatNumber(transaksi.totalDiskon)}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; padding: 1px 0; padding-bottom: 4px;">Biaya</td>
                            <td style="text-align: center; padding: 1px 0; padding-bottom: 4px;">:</td>
                            <td style="text-align: right; padding: 1px 0; padding-bottom: 4px;">${formatNumber(transaksi.totalBiayaLain)}</td>
                        </tr>
                        
                        <tr style="border-top: 1px solid black;">
                            <td style="text-align: left; font-weight:bold; font-size:13px; padding-top: 4px;">TOTAL</td>
                            <td style="text-align: center; font-weight:bold; font-size:13px; padding-top: 4px;">:</td>
                            <td style="text-align: right; font-weight:bold; font-size:13px; padding-top: 4px;">${formatNumber(transaksi.totalNetto)}</td>
                        </tr>

                        <tr>
                            <td style="text-align: left; padding: 2px 0; padding-bottom: 4px;">Bayar</td>
                            <td style="text-align: center; padding: 2px 0; padding-bottom: 4px;">:</td>
                            <td style="text-align: right; padding: 2px 0; padding-bottom: 4px;">${formatNumber(transaksi.totalBayar)}</td>
                        </tr>
                        
                        <tr style="border-top: 1px solid black;">
                            <td style="text-align: left; padding-top: 4px;">Sisa</td>
                            <td style="text-align: center; padding-top: 4px;">:</td>
                            <td style="text-align: right; padding-top: 4px;">${formatNumber(sisaTagihan)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
    `;
    return html;
};
export const generateSuratJalan = (transaksi, items) => {
    // 1. CLONE & SORT ITEMS
    const dataItems = items ? [...items] : [];

    dataItems.sort((a, b) => {
        const strA = getCleanClassStr(a);
        const strB = getCleanClassStr(b);
        
        const weightA = getKelasWeight(strA);
        const weightB = getKelasWeight(strB);

        if (Math.floor(weightA / 100) !== Math.floor(weightB / 100)) {
            return weightA - weightB;
        }

        if (weightA >= 100) {
            return weightA - weightB;
        } else {
            return strA.localeCompare(strB, undefined, { 
                numeric: true, 
                sensitivity: 'base' 
            });
        }
    });

    // 2. SETUP DATA UMUM
    const namaPelanggan = (transaksi.namaCustomer || 'Umum').toUpperCase();
    let totalQty = 0;
    dataItems.forEach(i => totalQty += Number(i.qty || i.jumlah || 0));

    // 3. GENERATE HTML
    let html = `
    <div style="${MAIN_STYLE}">
        <table style="width: 100%; margin-bottom: 15px;">
            <tr>
                <td width="60%" style="vertical-align: top;">
                    <div style="font-size:20px;">${companyInfo.nama}</div>
                    <div style="font-size:12px;">${companyInfo.hp}</div>
                </td>
                <td width="40%" style="text-align: right; vertical-align: top;">
                    <div style="font-size:16px; font-weight:bold; border-bottom: 1px solid black; display:inline-block; padding-bottom:2px; margin-bottom:5px;">SURAT JALAN</div>
                    <div style="font-size:12px;">No: ${transaksi.id || '-'}</div>
                    <div style="font-size:12px;">Tgl: ${formatDate(transaksi.tanggal)}</div>
                </td>
            </tr>
        </table>

        <div style="margin-bottom: 10px; font-size: 12px;">
            Kepada Yth: <b>${namaPelanggan}</b>
        </div>

        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px;">
            <thead>
                <tr style="border-top: 1px solid black; border-bottom: 1px solid black;">
                    <td width="5%" style="text-align: center; padding: 4px 0;">No</td>
                    <td width="15%" style="text-align: left; padding: 4px 0;">Kode</td>
                    <td width="45%" style="text-align: left; padding: 4px 0;">Nama Barang</td>
                    <td width="15%" style="text-align: left; padding: 4px 0;">Kelas</td>
                    <td width="10%" style="text-align: left; padding: 4px 0;">Ket</td>
                    <td width="10%" style="text-align: center; padding: 4px 0;">Qty</td>
                </tr>
            </thead>
            <tbody>
    `;

    dataItems.forEach((item, index) => {
        const qty = Number(item.qty || item.jumlah || 0);
        const namaBarang = item.judul || item.productName || '-';
        const kelasInfo = getDisplayKelas(item);

        html += `
            <tr>
                <td style="text-align: center; padding: 4px 0; vertical-align: top;">${index + 1}</td>
                <td style="text-align: left; padding: 4px 5px 4px 0; vertical-align: top; word-wrap: break-word;">${item.productId || '-'}</td>
                <td style="text-align: left; padding: 4px 5px 4px 0; vertical-align: top; word-wrap: break-word;">${namaBarang}</td>
                <td style="text-align: left; padding: 4px 5px 4px 0; vertical-align: top; word-wrap: break-word;">${kelasInfo}</td>
                <td style="text-align: left; padding: 4px 5px 4px 0; vertical-align: top; word-wrap: break-word;">${item.peruntukan || '-'}</td>
                <td style="text-align: center; padding: 4px 0; vertical-align: top;">${qty}</td>
            </tr>
        `;
    });

    // --- BAGIAN INI DIMODIFIKASI AGAR SEJAJAR ---
    html += `
            <tr style="border-top: 1px solid black;">
                <td colspan="3" style="text-align: left; padding-top: 6px; font-style: italic; font-size: 10px; vertical-align: top;">
                    * Harap barang dicek kembali. Barang yang sudah diterima tidak dapat dikembalikan.
                </td>

                <td colspan="2" style="text-align: right; padding-top: 6px; padding-right:10px; font-weight:bold; vertical-align: top;">
                    Total Item:
                </td>

                <td style="text-align: center; font-weight:bold; padding-top: 6px; vertical-align: top;">
                    ${totalQty}
                </td>
            </tr>
            </tbody>
        </table>

        <div style="margin-top: 25px; font-size: 12px;">
            <table style="width: 100%; text-align: center;">
                <tr>
                    <td width="33%" style="vertical-align: top;">
                        Hormat Kami,<br><br><br><br><br>
                        ( Admin )
                    </td>
                    <td width="33%" style="vertical-align: top;">
                        Supir,<br><br><br><br><br>
                        ( .......................... )
                    </td>
                    <td width="33%" style="vertical-align: top;">
                        Penerima,<br><br><br><br><br>
                        ( ${namaPelanggan.substring(0, 20)} )
                    </td>
                </tr>
            </table>
        </div>
    </div>
    `;

    return html;
};
// ==========================================
// 2. GENERATE NOTA PEMBAYARAN (CICILAN)
// ==========================================
export const generateNotaPembayaranText = (payment, allocations) => {
    const items = allocations || [];
    const namaPelanggan = (payment.namaCustomer || 'Umum').toUpperCase();

    let html = `
    <div style="${MAIN_STYLE}">
        <div style="text-align:center; font-size:16px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:8px;">NOTA PEMBAYARAN</div>
        
        <div style="border-bottom: 1px solid black; margin-bottom: 8px;"></div>
        
        <table style="width:100%; margin-bottom: 15px;">
            <tr>
                <td width="50%">No. Bayar: ${payment.id}</td>
                <td width="50%" style="text-align: right;">Tanggal: ${formatDate(payment.tanggal)}</td>
            </tr>
            <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <tr>
                    <td width="10%" style="text-align: center; padding: 5px 0;">No</td>
                    <td width="35%" style="text-align: left; padding: 5px 0;">No. Invoice</td>
                    <td width="30%" style="text-align: left; padding: 5px 0;">Keterangan</td>
                    <td width="25%" style="text-align: right; padding: 5px 0;">Jumlah (Rp)</td>
                </tr>
            </thead>
            <tbody>
    `;

    items.forEach((item, i) => {
        html += `
            <tr>
                <td style="text-align: center; vertical-align: top; padding-top: 3px;">${i + 1}</td>
                <td style="text-align: left; vertical-align: top; padding-top: 3px;">${item.invoiceId || '-'}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 3px;">${item.keterangan || payment.keterangan || '-'}</td>
                <td style="text-align: right; vertical-align: top; padding-top: 3px;">${formatNumber(item.amount)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot style="border-top: 1px solid black;">
                <tr>
                    <td colspan="3" style="text-align: right; font-weight:bold; padding-top: 5px;">TOTAL PEMBAYARAN :</td>
                    <td style="text-align: right; font-weight:bold; font-size:14px; padding-top: 5px;">${formatNumber(payment.totalBayar)}</td>
                </tr>
            </tfoot>
        </table>
        
        <table style="width:100%; margin-top: 25px;">
            <tr>
                <td width="50%" style="text-align: left;">Hormat Kami,<br><br><br><br>( Admin )</td>
                <td width="50%" style="text-align: left;">Customer,<br><br><br><br>( ${namaPelanggan.substring(0,15)} )</td>
            </tr>
        </table>
    </div>
    `;
    return html;
};

// ==========================================
// 3. GENERATE NOTA RETUR
// ==========================================

// ==========================================
// 4. GENERATE NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    const namaPelanggan = (data.namaCustomer || 'Umum').toUpperCase();
    
    let html = `
    <div style="${MAIN_STYLE}">
        <div style="text-align:center; font-size:16px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:8px;">NOTA NON-FAKTUR</div>
        <div style="border-bottom: 1px solid black; margin-bottom: 8px;"></div>
        
        <table style="width:100%; margin-bottom: 15px;">
            <tr>
                <td width="50%">No. Ref: ${data.id}</td>
                <td width="50%" style="text-align: right;">Tanggal: ${formatDate(data.tanggal)}</td>
            </tr>
            <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <tr>
                    <td width="10%" style="text-align: center; padding: 5px 0;">No</td>
                    <td width="60%" style="text-align: left; padding: 5px 0;">Keterangan</td>
                    <td width="30%" style="text-align: right; padding: 5px 0;">Jumlah (Rp)</td>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="text-align: center; vertical-align: top; padding-top: 3px;">1</td>
                    <td style="text-align: left; vertical-align: top; padding-top: 3px;">${data.keterangan || '-'}</td>
                    <td style="text-align: right; vertical-align: top; padding-top: 3px;">${formatNumber(data.totalBayar)}</td>
                </tr>
            </tbody>
            <tfoot style="border-top: 1px solid black;">
                <tr>
                    <td colspan="2" style="text-align: right; font-weight:bold; padding-top: 5px;">TOTAL BAYAR :</td>
                    <td style="text-align: right; font-weight:bold; font-size:14px; padding-top: 5px;">${formatNumber(data.totalBayar)}</td>
                </tr>
            </tfoot>
        </table>
        
        <table style="width:100%; margin-top: 25px;">
            <tr>
                <td width="50%" style="text-align: left;">Hormat Kami,<br><br><br><br>( Admin )</td>
                <td width="50%" style="text-align: left;">Customer,<br><br><br><br>( ${namaPelanggan.substring(0,15)} )</td>
            </tr>
        </table>
    </div>
    `;
    return html;
};

