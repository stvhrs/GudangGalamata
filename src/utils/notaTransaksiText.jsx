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

// ==========================================
// 1. GENERATE NOTA TRANSAKSI (INVOICE)
// ==========================================
export const generateTransaksiText = (transaksi, items, type = 'INVOICE') => {
    const dataItems = items || [];
    const judul = type === 'INVOICE' ? 'INVOICE PENJUALAN' : 'NOTA PENJUALAN';
    const sisaTagihan = Number(transaksi.sisaTagihan || 0);
    const namaPelanggan = (transaksi.namaCustomer || 'Umum').toUpperCase();

    let totalQty = 0;
    dataItems.forEach(i => totalQty += Number(i.qty || i.jumlah || 0));

    let html = `
    <table style="width: 100%; margin-bottom: 5px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="60%" style="vertical-align: top;">
                <div style="font-size:18px; font-weight:bold;">${companyInfo.nama}</div>
                <div>${companyInfo.hp}</div>
            </td>
            <td width="40%" class="text-right" style="vertical-align: top;">
                <div style="font-size:16px; font-weight:bold;">${judul}</div>
                <div>No: <b>${transaksi.id || '-'}</b></div>
                <div>Tgl: ${formatDate(transaksi.tanggal)}</div>
            </td>
        </tr>
    </table>

    <div style="margin-bottom: 5px; font-family: 'Courier New', monospace;">
        Kepada Yth: <b>${namaPelanggan}</b>
    </div>

    <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-family: 'Courier New', monospace; font-size: 12px;">
        <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
            <tr>
                <th width="25px" class="text-center" style="vertical-align: top; padding: 5px 0;">No</th>
                <th class="text-left" style="vertical-align: top; padding: 5px 0;">Nama Barang</th>
                <th width="40px" class="text-center" style="vertical-align: top; padding: 5px 0;">Qty</th>
                <th width="85px" class="text-right" style="vertical-align: top; padding: 5px 0;">Harga</th>
                <th width="95px" class="text-right" style="vertical-align: top; padding: 5px 0;">Subtotal</th>
            </tr>
        </thead>
        <tbody>
    `;

    dataItems.forEach((item, index) => {
        const qty = Number(item.qty || item.jumlah || 0);
        const harga = Number(item.harga || item.hargaSatuan || 0);
        const subtotal = Number(item.subtotal || 0);

        html += `
            <tr>
                <td class="text-center" style="padding: 2px 0; vertical-align: top;">${index + 1}</td>
                <td class="text-left" style="padding: 2px 5px 2px 0; vertical-align: top; word-wrap: break-word;">${item.judul || item.productName || '-'}</td>
                <td class="text-center" style="padding: 2px 0; vertical-align: top;">${qty}</td>
                <td class="text-right" style="padding: 2px 0; vertical-align: top;">${formatNumber(harga)}</td>
                <td class="text-right" style="padding: 2px 0; vertical-align: top; font-weight:bold;">${formatNumber(subtotal)}</td>
            </tr>
        `;
    });

    html += `
        </tbody>
        <tfoot style="border-top: 1px solid black;">
            <tr>
                <td colspan="2" class="text-right" style="font-weight:bold; padding-top: 5px; padding-right:10px;">Total Item:</td>
                <td class="text-center" style="font-weight:bold; padding-top: 5px;">${formatNumber(totalQty)}</td>
                <td colspan="2"></td>
            </tr>
        </tfoot>
    </table>

    <table style="width: 100%; margin-top: 10px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="55%" style="vertical-align: top; padding-right: 20px;">
                <div style="font-size:11px; font-style: italic; margin-bottom: 15px; font-weight:bold;">
                    * Komplain maksimal 3 hari setelah barang diterima.
                </div>
                <table style="width: 100%;">
                    <tr>
                        <td class="text-center" width="50%">Hormat Kami,<br><br><br><br><b>( Admin )</b></td>
                        <td class="text-center" width="50%">Penerima,<br><br><br><br><b>( ${namaPelanggan.substring(0,15)} )</b></td>
                    </tr>
                </table>
            </td>
            <td width="45%" style="vertical-align: top;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td class="text-right" style="font-weight:bold;" width="60%">Total Bruto :</td>
                        <td class="text-right" width="40%">${formatNumber(transaksi.totalBruto)}</td>
                    </tr>
                    <tr>
                        <td class="text-right" style="font-weight:bold;">Diskon :</td>
                        <td class="text-right"><b>${formatNumber(transaksi.totalDiskon)}</b></td>
                    </tr>
                    <tr>
                        <td class="text-right" style="font-weight:bold; padding-bottom: 5px;">Biaya Lain :</td>
                        <td class="text-right" style="padding-bottom: 5px;">${formatNumber(transaksi.totalBiayaLain)}</td>
                    </tr>
                    <tr style="border-top: 1px solid black;">
                        <td class="text-right" style="font-weight:bold; font-size:14px; padding-top: 5px;">GRAND TOTAL :</td>
                        <td class="text-right" style="font-weight:bold; font-size:14px; padding-top: 5px;">${formatNumber(transaksi.totalNetto)}</td>
                    </tr>
                    <tr>
                        <td class="text-right" style="font-weight:bold; padding-bottom: 5px;">Bayar :</td>
                        <td class="text-right" style="padding-bottom: 5px;">${formatNumber(transaksi.totalBayar)}</td>
                    </tr>
                    <tr style="border-top: 1px solid black;">
                        <td class="text-right" style="font-weight:bold; padding-top: 5px;">Sisa :</td>
                        <td class="text-right" style="font-weight:bold; padding-top: 5px;">${formatNumber(sisaTagihan)}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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
    <div style="text-align:center; font-weight:bold; font-size:16px; font-family: 'Courier New', monospace;">${companyInfo.nama}</div>
    <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px; font-family: 'Courier New', monospace;">NOTA PEMBAYARAN</div>
    
    <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
    
    <table style="width:100%; margin-bottom: 10px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="50%">No. Bayar: <b>${payment.id}</b></td>
            <td width="50%" class="text-right">Tanggal: ${formatDate(payment.tanggal)}</td>
        </tr>
        <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
    </table>

    <table style="width:100%; border-collapse: collapse; table-layout: fixed; font-family: 'Courier New', monospace; font-size:12px;">
        <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
            <tr>
                <th width="25px" class="text-center" style="vertical-align: top; padding: 5px 0;">No</th>
                <th width="140px" class="text-left" style="vertical-align: top; padding: 5px 0;">No. Invoice</th>
                <th class="text-left" style="vertical-align: top; padding: 5px 0;">Keterangan</th>
                <th width="110px" class="text-right" style="vertical-align: top; padding: 5px 0;">Jumlah (Rp)</th>
            </tr>
        </thead>
        <tbody>
    `;

    items.forEach((item, i) => {
        html += `
            <tr>
                <td class="text-center" style="vertical-align: top; padding-top: 2px;">${i + 1}</td>
                <td class="text-left" style="vertical-align: top; padding-top: 2px;">${item.invoiceId || '-'}</td>
                <td class="text-left" style="vertical-align: top; padding-right:5px; padding-top: 2px;">${item.keterangan || payment.keterangan || '-'}</td>
                <td class="text-right" style="font-weight:bold; vertical-align: top; padding-top: 2px;">${formatNumber(item.amount)}</td>
            </tr>
        `;
    });

    html += `
        </tbody>
        <tfoot style="border-top: 1px solid black;">
            <tr>
                <td colspan="3" class="text-right" style="font-weight:bold; padding-top: 5px;">TOTAL PEMBAYARAN :</td>
                <td class="text-right" style="font-weight:bold; font-size:15px; padding-top: 5px;">${formatNumber(payment.totalBayar)}</td>
            </tr>
        </tfoot>
    </table>
    <br/>
    <div style="float: right; width: 200px; text-align: center; font-family: 'Courier New', monospace;">
        Penerima,<br><br><br>
        <b>( Admin )</b>
    </div>
    <div style="clear:both;"></div>
    `;
    return html;
};

// ==========================================
// 3. GENERATE NOTA RETUR
// ==========================================
export const generateReturText = (returData, items) => {
    const dataItems = items || [];
    const namaPelanggan = (returData.namaCustomer || 'Umum').toUpperCase();

    let html = `
    <div style="text-align:center; font-weight:bold; font-size:16px; font-family: 'Courier New', monospace;">${companyInfo.nama}</div>
    <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px; font-family: 'Courier New', monospace;">NOTA RETUR PENJUALAN</div>
    <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>

    <table style="width:100%; margin-bottom:10px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="60%">
                No. Retur: <b>${returData.id || '-'}</b><br>
                Ref. Inv : <b>${returData.invoiceId || '-'}</b>
            </td>
            <td width="40%" class="text-right">
                Tanggal: ${formatDate(returData.tanggal)}<br>
                Customer: <b>${namaPelanggan}</b>
            </td>
        </tr>
    </table>

    <table style="width:100%; border-collapse: collapse; table-layout: fixed; font-family: 'Courier New', monospace; font-size:12px;">
        <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
            <tr>
                <th width="25px" class="text-center" style="vertical-align: top; padding: 5px 0;">No</th>
                <th class="text-left" style="vertical-align: top; padding: 5px 0;">Barang</th>
                <th width="40px" class="text-center" style="vertical-align: top; padding: 5px 0;">Qty</th>
                <th width="85px" class="text-right" style="vertical-align: top; padding: 5px 0;">Harga</th>
                <th width="95px" class="text-right" style="vertical-align: top; padding: 5px 0;">Subtotal</th>
            </tr>
        </thead>
        <tbody>
    `;

    dataItems.forEach((item, i) => {
        html += `
            <tr>
                <td class="text-center" style="vertical-align: top; padding-top: 2px;">${i + 1}</td>
                <td class="text-left" style="vertical-align: top; padding-right:5px; padding-top: 2px;">${item.judul || item.productName || 'Retur Manual'}</td>
                <td class="text-center" style="vertical-align: top; padding-top: 2px;">${item.qty || 0}</td>
                <td class="text-right" style="vertical-align: top; padding-top: 2px;">${formatNumber(item.harga)}</td>
                <td class="text-right" style="vertical-align: top; font-weight:bold; padding-top: 2px;">${formatNumber(item.subtotal)}</td>
            </tr>
        `;
    });

    html += `
        </tbody>
        <tfoot style="border-top: 1px solid black;">
            <tr>
                <td colspan="4" class="text-right" style="font-weight:bold; padding-top: 5px;">TOTAL UANG KEMBALI :</td>
                <td class="text-right" style="font-weight:bold; font-size:15px; padding-top: 5px;">${formatNumber(returData.totalRetur)}</td>
            </tr>
        </tfoot>
    </table>
    
    <table style="width:100%; margin-top: 20px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="50%" class="text-center">Hormat Kami,<br><br><br><b>( Admin )</b></td>
            <td width="50%" class="text-center">Customer,<br><br><br><b>( ${namaPelanggan.substring(0,15)} )</b></td>
        </tr>
    </table>
    `;
    return html;
};

// ==========================================
// 4. GENERATE NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    const namaPelanggan = (data.namaCustomer || 'Umum').toUpperCase();
    
    let html = `
    <div style="text-align:center; font-weight:bold; font-size:16px; font-family: 'Courier New', monospace;">${companyInfo.nama}</div>
    <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px; font-family: 'Courier New', monospace;">NOTA NON-FAKTUR</div>
    <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
    
    <table style="width:100%; margin-bottom: 10px; font-family: 'Courier New', monospace;">
        <tr>
            <td width="50%">No. Ref: <b>${data.id}</b></td>
            <td width="50%" class="text-right">Tanggal: ${formatDate(data.tanggal)}</td>
        </tr>
        <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
    </table>

    <table style="width:100%; border-collapse: collapse; table-layout: fixed; font-family: 'Courier New', monospace; font-size:12px;">
        <thead style="border-top: 1px solid black; border-bottom: 1px solid black;">
            <tr>
                <th width="25px" class="text-center" style="vertical-align: top; padding: 5px 0;">No</th>
                <th class="text-left" style="vertical-align: top; padding: 5px 0;">Keterangan</th>
                <th width="120px" class="text-right" style="vertical-align: top; padding: 5px 0;">Jumlah (Rp)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="text-center" style="vertical-align: top; padding-top: 2px;">1</td>
                <td class="text-left" style="vertical-align: top; padding-top: 2px;">${data.keterangan || '-'}</td>
                <td class="text-right" style="font-weight:bold; vertical-align: top; padding-top: 2px;">${formatNumber(data.totalBayar)}</td>
            </tr>
        </tbody>
        <tfoot style="border-top: 1px solid black;">
            <tr>
                <td colspan="2" class="text-right" style="font-weight:bold; padding-top: 5px;">TOTAL BAYAR :</td>
                <td class="text-right" style="font-weight:bold; font-size:15px; padding-top: 5px;">${formatNumber(data.totalBayar)}</td>
            </tr>
        </tfoot>
    </table>
    <br/>
    <div style="float: right; width: 200px; text-align: center; font-family: 'Courier New', monospace;">
        Penerima,<br><br><br><b>( Admin )</b>
    </div>
    <div style="clear:both;"></div>
    `;
    return html;
};