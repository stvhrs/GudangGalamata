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

const romanMap = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
    'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
    'XI': 11, 'XII': 12
};

// Fungsi UTAMA: Mendapatkan angka/romawi kelas bersih (misal: "XII" atau "10")
// Prioritas: 1. item.kelas, 2. Regex dari Judul
const getCleanClassStr = (item) => {
    let raw = item.kelas; // Cek property kelas dulu

    // Jika property kelas kosong, cari di judul/nama produk
    if (!raw) {
        const text = item.judul || item.productName || '';
        const match = text.match(/KELAS\s+([IVX0-9]+)/i);
        if (match) raw = match[1]; // Ambil capture group angkanya saja
    }

    if (!raw) return null;

    // Bersihkan string (jaga-jaga jika isi property item.kelas adalah "KELAS V", kita ambil "V"-nya saja)
    const cleanMatch = raw.toString().match(/([IVX0-9]+)/i);
    return cleanMatch ? cleanMatch[0].toUpperCase() : null;
};

// Fungsi hitung bobot untuk sorting
const getKelasWeight = (item) => {
    const val = getCleanClassStr(item);
    
    if (!val) return 0; // Tidak ada kelas (UMUM) = Paling Atas (0)
    
    // Cek map Romawi atau parse angka biasa. Default 99 jika format aneh.
    return romanMap[val] || parseInt(val) || 99; 
};

// Fungsi untuk tampilan di Tabel (Return string "KELAS XII" atau "-")
const getDisplayKelas = (item) => {
    const val = getCleanClassStr(item);
    return val ? `KELAS ${val}` : '-';
};


// ==========================================
// 1. GENERATE RETUR TEXT
// ==========================================
export const generateReturText = (returData, items) => {
    // CLONE & SORT ITEMS
    const dataItems = items ? [...items] : [];

    // Sorting: UMUM (0) -> KELAS I (1) -> ... -> KELAS XII (12)
    dataItems.sort((a, b) => {
        return getKelasWeight(a) - getKelasWeight(b);
    });

    const namaPelanggan = (returData.namaCustomer || 'Umum').toUpperCase();

    let totalQty = 0;
    dataItems.forEach(i => totalQty += Number(i.qty || 0));

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

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
                <tr>
                    <td width="5%" style="text-align: center; padding: 5px 0;">No</td>
                    <td width="10%" style="text-align: left; padding: 5px 0;">Kode</td>
                    <td width="22%" style="text-align: left; padding: 5px 0;">Barang</td>
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
        // Gunakan helper baru untuk display
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

    html += `
            </tbody>
            <tfoot style="border-top: 1px solid black;">
                <tr>
                    <td colspan="5" style="text-align: right; padding-top: 5px; padding-right:10px;">Total Item:</td>
                    
                    <td style="text-align: right; font-weight:bold; padding-top: 5px;">${totalQty}</td>
                    
                    <td colspan="2"></td>
                </tr>
                <tr>
                    <td colspan="7" style="text-align: right; font-weight:bold; padding-top: 5px;">TOTAL UANG KEMBALI :</td>
                    <td style="text-align: right; font-weight:bold; font-size:14px; padding-top: 5px;">${formatNumber(returData.totalRetur)}</td>
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
// 2. GENERATE TRANSAKSI TEXT
// ==========================================
export const generateTransaksiText = (transaksi, items, type = 'INVOICE') => {
    // CLONE & SORT ITEMS
    const dataItems = items ? [...items] : [];
    
    // Sorting: UMUM (0) -> KELAS I (1) -> ... -> KELAS XII (12)
    dataItems.sort((a, b) => {
        return getKelasWeight(a) - getKelasWeight(b);
    });

    const judul = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);
    const namaPelanggan = (transaksi.namaCustomer || 'Umum').toUpperCase();

    let totalQty = 0;
    dataItems.forEach(i => totalQty += Number(i.qty || i.jumlah || 0));

    // LAYOUT BARU:
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
        // Gunakan helper baru untuk display
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

