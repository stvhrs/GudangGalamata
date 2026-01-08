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
    <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #000;">
        <table style="width: 100%; margin-bottom: 10px;">
            <tr>
                <td width="60%" style="vertical-align: top;">
                    <div style="font-size:20px; font-weight:bold;">${companyInfo.nama}</div>
                    <div>${companyInfo.hp}</div>
                </td>
                <td width="40%" style="text-align: right; vertical-align: top;">
                    <div style="font-size:18px; font-weight:bold;">${judul}</div>
                    <div>No: <b>${transaksi.id || '-'}</b></div>
                    <div>Tgl: ${formatDate(transaksi.tanggal)}</div>
                </td>
            </tr>
        </table>

        <div style="margin-bottom: 10px;">
            Kepada Yth: <b>${namaPelanggan}</b>
        </div>

        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 2px solid black; border-bottom: 2px solid black;">
                <tr>
                    <th width="5%" style="text-align: center; padding: 8px 0;">No</th>
                    <th width="45%" style="text-align: left; padding: 8px 0;">Nama Barang</th>
                    <th width="10%" style="text-align: center; padding: 8px 0;">Qty</th>
                    <th width="20%" style="text-align: right; padding: 8px 0;">Harga</th>
                    <th width="20%" style="text-align: right; padding: 8px 0;">Subtotal</th>
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
                <td style="text-align: center; padding: 4px 0; vertical-align: top;">${index + 1}</td>
                <td style="text-align: left; padding: 4px 5px 4px 0; vertical-align: top; word-wrap: break-word;">${item.judul || item.productName || '-'}</td>
                <td style="text-align: center; padding: 4px 0; vertical-align: top;">${qty}</td>
                <td style="text-align: right; padding: 4px 0; vertical-align: top;">${formatNumber(harga)}</td>
                <td style="text-align: right; padding: 4px 0; vertical-align: top; font-weight:bold;">${formatNumber(subtotal)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot style="border-top: 2px solid black;">
                <tr>
                    <td colspan="2" style="text-align: right; font-weight:bold; padding-top: 8px; padding-right:10px;">Total Item:</td>
                    <td style="text-align: center; font-weight:bold; padding-top: 8px;">${formatNumber(totalQty)}</td>
                    <td colspan="2"></td>
                </tr>
            </tfoot>
        </table>

        <table style="width: 100%; margin-top: 15px;">
            <tr>
                <td width="55%" style="vertical-align: top; padding-right: 20px;">
                    <div style="font-size:12px; font-style: italic; margin-bottom: 20px; font-weight:bold;">
                        * Komplain maksimal 3 hari setelah barang diterima.
                    </div>
                    <table style="width: 100%;">
                        <tr>
                            <td style="text-align: center;" width="50%">Hormat Kami,<br><br><br><br><br><b>( Admin )</b></td>
                            <td style="text-align: center;" width="50%">Penerima,<br><br><br><br><br><b>( ${namaPelanggan.substring(0,15)} )</b></td>
                        </tr>
                    </table>
                </td>
                <td width="45%" style="vertical-align: top;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td width="50%" style="text-align: left; font-weight:bold; padding: 2px 0;">Total Bruto</td>
                            <td width="5%"  style="text-align: center; font-weight:bold; padding: 2px 0;">:</td>
                            <td width="45%" style="text-align: right; padding: 2px 0;">${formatNumber(transaksi.totalBruto)}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; font-weight:bold; padding: 2px 0;">Diskon</td>
                            <td style="text-align: center; font-weight:bold; padding: 2px 0;">:</td>
                            <td style="text-align: right; padding: 2px 0;"><b>${formatNumber(transaksi.totalDiskon)}</b></td>
                        </tr>
                        <tr>
                            <td style="text-align: left; font-weight:bold; padding: 2px 0; padding-bottom: 8px;">Biaya Lain</td>
                            <td style="text-align: center; font-weight:bold; padding: 2px 0; padding-bottom: 8px;">:</td>
                            <td style="text-align: right; padding: 2px 0; padding-bottom: 8px;">${formatNumber(transaksi.totalBiayaLain)}</td>
                        </tr>
                        
                        <tr style="border-top: 1px solid black;">
                            <td style="text-align: left; font-weight:bold; font-size:16px; padding-top: 8px;">GRAND TOTAL</td>
                            <td style="text-align: center; font-weight:bold; font-size:16px; padding-top: 8px;">:</td>
                            <td style="text-align: right; font-weight:bold; font-size:16px; padding-top: 8px;">${formatNumber(transaksi.totalNetto)}</td>
                        </tr>
                        <tr>
                            <td style="text-align: left; font-weight:bold; padding: 4px 0; padding-bottom: 8px;">Bayar</td>
                            <td style="text-align: center; font-weight:bold; padding: 4px 0; padding-bottom: 8px;">:</td>
                            <td style="text-align: right; padding: 4px 0; padding-bottom: 8px;">${formatNumber(transaksi.totalBayar)}</td>
                        </tr>
                        <tr style="border-top: 1px solid black;">
                            <td style="text-align: left; font-weight:bold; padding-top: 8px;">Sisa</td>
                            <td style="text-align: center; font-weight:bold; padding-top: 8px;">:</td>
                            <td style="text-align: right; font-weight:bold; padding-top: 8px;">${formatNumber(sisaTagihan)}</td>
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
    <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #000;">
        <div style="text-align:center; font-weight:bold; font-size:18px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:8px;">NOTA PEMBAYARAN</div>
        
        <div style="border-bottom: 2px solid black; margin-bottom: 8px;"></div>
        
        <table style="width:100%; margin-bottom: 15px;">
            <tr>
                <td width="50%">No. Bayar: <b>${payment.id}</b></td>
                <td width="50%" style="text-align: right;">Tanggal: ${formatDate(payment.tanggal)}</td>
            </tr>
            <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 2px solid black; border-bottom: 2px solid black;">
                <tr>
                    <th width="10%" style="text-align: center; padding: 8px 0;">No</th>
                    <th width="35%" style="text-align: left; padding: 8px 0;">No. Invoice</th>
                    <th width="30%" style="text-align: left; padding: 8px 0;">Keterangan</th>
                    <th width="25%" style="text-align: right; padding: 8px 0;">Jumlah (Rp)</th>
                </tr>
            </thead>
            <tbody>
    `;

    items.forEach((item, i) => {
        html += `
            <tr>
                <td style="text-align: center; vertical-align: top; padding-top: 4px;">${i + 1}</td>
                <td style="text-align: left; vertical-align: top; padding-top: 4px;">${item.invoiceId || '-'}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 4px;">${item.keterangan || payment.keterangan || '-'}</td>
                <td style="text-align: right; font-weight:bold; vertical-align: top; padding-top: 4px;">${formatNumber(item.amount)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot style="border-top: 2px solid black;">
                <tr>
                    <td colspan="3" style="text-align: right; font-weight:bold; padding-top: 8px;">TOTAL PEMBAYARAN :</td>
                    <td style="text-align: right; font-weight:bold; font-size:16px; padding-top: 8px;">${formatNumber(payment.totalBayar)}</td>
                </tr>
            </tfoot>
        </table>
        <br/>
        <div style="float: right; width: 220px; text-align: center;">
            Penerima,<br><br><br><br>
            <b>( Admin )</b>
        </div>
        <div style="clear:both;"></div>
    </div>
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
    <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #000;">
        <div style="text-align:center; font-weight:bold; font-size:18px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:8px;">NOTA RETUR PENJUALAN</div>
        <div style="border-bottom: 2px solid black; margin-bottom: 8px;"></div>

        <table style="width:100%; margin-bottom:15px;">
            <tr>
                <td width="60%">
                    No. Retur: <b>${returData.id || '-'}</b><br>
                    Ref. Inv : <b>${returData.invoiceId || '-'}</b>
                </td>
                <td width="40%" style="text-align: right;">
                    Tanggal: ${formatDate(returData.tanggal)}<br>
                    Customer: <b>${namaPelanggan}</b>
                </td>
            </tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 2px solid black; border-bottom: 2px solid black;">
                <tr>
                    <th width="5%" style="text-align: center; padding: 8px 0;">No</th>
                    <th width="45%" style="text-align: left; padding: 8px 0;">Barang</th>
                    <th width="10%" style="text-align: center; padding: 8px 0;">Qty</th>
                    <th width="20%" style="text-align: right; padding: 8px 0;">Harga</th>
                    <th width="20%" style="text-align: right; padding: 8px 0;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
    `;

    dataItems.forEach((item, i) => {
        html += `
            <tr>
                <td style="text-align: center; vertical-align: top; padding-top: 4px;">${i + 1}</td>
                <td style="text-align: left; vertical-align: top; padding-right:5px; padding-top: 4px;">${item.judul || item.productName || 'Retur Manual'}</td>
                <td style="text-align: center; vertical-align: top; padding-top: 4px;">${item.qty || 0}</td>
                <td style="text-align: right; vertical-align: top; padding-top: 4px;">${formatNumber(item.harga)}</td>
                <td style="text-align: right; vertical-align: top; font-weight:bold; padding-top: 4px;">${formatNumber(item.subtotal)}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot style="border-top: 2px solid black;">
                <tr>
                    <td colspan="4" style="text-align: right; font-weight:bold; padding-top: 8px;">TOTAL UANG KEMBALI :</td>
                    <td style="text-align: right; font-weight:bold; font-size:16px; padding-top: 8px;">${formatNumber(returData.totalRetur)}</td>
                </tr>
            </tfoot>
        </table>
        
        <table style="width:100%; margin-top: 25px;">
            <tr>
                <td width="50%" style="text-align: center;">Hormat Kami,<br><br><br><br><b>( Admin )</b></td>
                <td width="50%" style="text-align: center;">Customer,<br><br><br><br><b>( ${namaPelanggan.substring(0,15)} )</b></td>
            </tr>
        </table>
    </div>
    `;
    return html;
};

// ==========================================
// 4. GENERATE NOTA NON-FAKTUR
// ==========================================
export const generateNotaNonFakturText = (data) => {
    const namaPelanggan = (data.namaCustomer || 'Umum').toUpperCase();
    
    let html = `
    <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #000;">
        <div style="text-align:center; font-weight:bold; font-size:18px;">${companyInfo.nama}</div>
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:8px;">NOTA NON-FAKTUR</div>
        <div style="border-bottom: 2px solid black; margin-bottom: 8px;"></div>
        
        <table style="width:100%; margin-bottom: 15px;">
            <tr>
                <td width="50%">No. Ref: <b>${data.id}</b></td>
                <td width="50%" style="text-align: right;">Tanggal: ${formatDate(data.tanggal)}</td>
            </tr>
            <tr><td colspan="2">Customer: <b>${namaPelanggan}</b></td></tr>
        </table>

        <table style="width:100%; border-collapse: collapse; table-layout: fixed;">
            <thead style="border-top: 2px solid black; border-bottom: 2px solid black;">
                <tr>
                    <th width="10%" style="text-align: center; padding: 8px 0;">No</th>
                    <th width="60%" style="text-align: left; padding: 8px 0;">Keterangan</th>
                    <th width="30%" style="text-align: right; padding: 8px 0;">Jumlah (Rp)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="text-align: center; vertical-align: top; padding-top: 4px;">1</td>
                    <td style="text-align: left; vertical-align: top; padding-top: 4px;">${data.keterangan || '-'}</td>
                    <td style="text-align: right; font-weight:bold; vertical-align: top; padding-top: 4px;">${formatNumber(data.totalBayar)}</td>
                </tr>
            </tbody>
            <tfoot style="border-top: 2px solid black;">
                <tr>
                    <td colspan="2" style="text-align: right; font-weight:bold; padding-top: 8px;">TOTAL BAYAR :</td>
                    <td style="text-align: right; font-weight:bold; font-size:16px; padding-top: 8px;">${formatNumber(data.totalBayar)}</td>
                </tr>
            </tfoot>
        </table>
        <br/>
        <div style="float: right; width: 220px; text-align: center;">
            Penerima,<br><br><br><br><b>( Admin )</b>
        </div>
        <div style="clear:both;"></div>
    </div>
    `;
    return html;
};