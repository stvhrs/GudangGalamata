import React from 'react';
import dayjs from 'dayjs';
import './PrintNota.css'; // Import CSS dari artifact sebelumnya

/**
 * Component untuk Print Nota Non-Faktur
 * Alternatif dari PDF Generator - Print langsung dari browser
 */
const PrintableNota = ({ record }) => {
    const formatRupiah = (value) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(value || 0);
    };

    const formatTanggal = (timestamp) => {
        return dayjs(timestamp).format('DD MMMM YYYY [pukul] HH.mm');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            {/* Inject Print CSS */}
            <style>{`
                @media print {
                    @page {
                        size: A5 landscape;
                        margin: 10mm 15mm;
                    }

                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    body {
                        margin: 0;
                        padding: 0;
                    }

                    .no-print {
                        display: none !important;
                    }

                    .print-container {
                        width: 100%;
                        max-height: 128.5mm; /* A5 height minus margins */
                        overflow: hidden;
                        page-break-after: always;
                    }

                    .nota-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-bottom: 6px;
                        border-bottom: 2px solid #000;
                        margin-bottom: 8px;
                    }

                    .nota-header h2 {
                        margin: 0;
                        font-size: 16px;
                        font-weight: bold;
                    }

                    .nota-header h3 {
                        margin: 0;
                        font-size: 14px;
                        font-weight: bold;
                    }

                    .nota-info {
                        display: flex;
                        justify-content: space-between;
                        margin: 10px 0;
                        font-size: 11px;
                    }

                    .nota-info-row {
                        margin-bottom: 4px;
                    }

                    .nota-info-label {
                        font-weight: bold;
                        display: inline-block;
                        width: 100px;
                    }

                    .nota-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 12px 0;
                        font-size: 11px;
                    }

                    .nota-table th,
                    .nota-table td {
                        border: 1px solid #333;
                        padding: 5px 8px;
                        text-align: left;
                    }

                    .nota-table th {
                        background-color: #f0f0f0;
                        font-weight: bold;
                    }

                    .nota-table .text-right {
                        text-align: right;
                    }

                    .nota-table .text-center {
                        text-align: center;
                    }

                    .nota-table tfoot td {
                        font-weight: bold;
                        background-color: #f9f9f9;
                    }

                    .nota-footer {
                        display: flex;
                        justify-content: space-between;
                        margin-top: 20px;
                        font-size: 11px;
                    }

                    .signature-box {
                        text-align: center;
                        width: 45%;
                    }

                    .signature-line {
                        margin-top: 40px;
                        padding-top: 2px;
                        border-top: 1px solid #000;
                        display: inline-block;
                        min-width: 120px;
                    }

                    p {
                        margin: 4px 0;
                    }
                }

                @media screen {
                    .print-preview {
                        width: 210mm;
                        min-height: 148.5mm;
                        max-height: 148.5mm;
                        margin: 20px auto;
                        padding: 10mm 15mm;
                        background: white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        box-sizing: border-box;
                        overflow: hidden;
                    }

                    .print-button {
                        position: fixed;
                        bottom: 30px;
                        right: 30px;
                        padding: 12px 24px;
                        background: #722ed1;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        box-shadow: 0 4px 12px rgba(114, 46, 209, 0.3);
                        z-index: 1000;
                    }

                    .print-button:hover {
                        background: #9254de;
                    }
                }
            `}</style>

            <div className="print-preview print-container">
                {/* HEADER */}
                <div className="nota-header">
                    <h2>CV. GANGSAR MULIA UTAMA</h2>
                    <h3>NOTA NON-FAKTUR</h3>
                </div>

                {/* INFO TRANSAKSI */}
                <div className="nota-info">
                    <div className="nota-info-left">
                        <div className="nota-info-row">
                            <span className="nota-info-label">No. Transaksi:</span>
                            <span>{record.id || '-'}</span>
                        </div>
                        <div className="nota-info-row">
                            <span className="nota-info-label">Customer:</span>
                            <span>{record.namaCustomer || 'Umum'}</span>
                        </div>
                    </div>
                    <div className="nota-info-right">
                        <div className="nota-info-row">
                            <span className="nota-info-label">Tanggal:</span>
                            <span>{formatTanggal(record.tanggal)}</span>
                        </div>
                    </div>
                </div>

                {/* TABEL ITEMS */}
                <table className="nota-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }} className="text-center">No</th>
                            <th>Keterangan</th>
                            <th style={{ width: '120px' }} className="text-right">Jumlah</th>
                        </tr>
                    </thead>
                    <tbody>
                        {record.items && Array.isArray(record.items) ? (
                            record.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="text-center">{idx + 1}</td>
                                    <td>{item.keterangan || item.nama || '-'}</td>
                                    <td className="text-right">{formatRupiah(item.jumlah || 0)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td className="text-center">1</td>
                                <td>{record.keterangan || '-'}</td>
                                <td className="text-right">{formatRupiah(record.totalBayar || 0)}</td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan="2" className="text-right">Total:</td>
                            <td className="text-right">{formatRupiah(record.totalBayar || 0)}</td>
                        </tr>
                    </tfoot>
                </table>

                {/* FOOTER SIGNATURE */}
                <div className="nota-footer">
                    <div className="signature-box">
                        <div>Hormat Kami,</div>
                        <div className="signature-line">
                            ( _____________ )
                        </div>
                    </div>
                    <div className="signature-box">
                        <div>Penerima,</div>
                        <div className="signature-line">
                            ( {record.namaCustomer || 'CUSTOMER'} )
                        </div>
                    </div>
                </div>
            </div>

            {/* PRINT BUTTON */}
            <button className="print-button no-print" onClick={handlePrint}>
                🖨️ Print Nota
            </button>
        </>
    );
};

export default PrintableNota;