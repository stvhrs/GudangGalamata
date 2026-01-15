import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Modal, Table, DatePicker, Row, Col, Card, Statistic, Tag, Spin, Typography, Input, Button, Space, message 
} from 'antd';
import { 
    ArrowUpOutlined,
    ArrowDownOutlined,
    SearchOutlined,
    PrinterOutlined,
    CopyOutlined
} from '@ant-design/icons';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../../api/firebase'; 
import dayjs from 'dayjs';
import 'dayjs/locale/id'; 
import html2canvas from 'html2canvas';

// Set locale global ke Indonesia
dayjs.locale('id');

const { RangePicker } = DatePicker;
const { Text } = Typography;

export default function CustomerHistoryModal({ open, onCancel, customer }) {
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState([]);
    const [initialMigration, setInitialMigration] = useState(0);

    // State Filter & Search
    const [dateRange, setDateRange] = useState([null, null]);
    const [searchText, setSearchText] = useState('');

    // State Print, Copy & Pagination
    // printableData akan menyimpan data yang SUDAH di-filter dan SUDAH di-sort oleh user
    const [printableData, setPrintableData] = useState([]); 
    const [copyLoading, setCopyLoading] = useState(false);
    
    // Default Pagination State
    const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
    
    // Ref untuk area yang akan dijadikan gambar
    const paperRef = useRef(null);
    
    // --- FORMAT ANGKA (Tanpa Rp) ---
    const formatNumber = (num) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'decimal', 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num || 0);
    };

    // --- FETCH DATA ---
    useEffect(() => {
        if (open && customer?.id) {
            const safeId = String(customer.id);
            fetchAllTransactionStreams(safeId);
        } else {
            setRawData([]);
            setInitialMigration(0); 
            setSearchText('');
            setDateRange([null, null]);
            setPrintableData([]);
            setPagination({ current: 1, pageSize: 15 });
        }
    }, [open, customer]);

    const fetchAllTransactionStreams = async (customerId) => {
        setLoading(true);
        try {
            const invoicesRef = query(ref(db, 'invoices'), orderByChild('customerId'), equalTo(customerId));
            const paymentsRef = query(ref(db, 'payments'), orderByChild('customerId'), equalTo(customerId));
            const nonFakturRef = query(ref(db, 'non_faktur'), orderByChild('customerId'), equalTo(customerId));
            const returnsRef = query(ref(db, 'returns'), orderByChild('customerId'), equalTo(customerId));
            const customerRef = ref(db, `customers/${customerId}`);

            const [invSnap, paySnap, nfSnap, retSnap, custSnap] = await Promise.all([
                get(invoicesRef), get(paymentsRef), get(nonFakturRef), get(returnsRef), get(customerRef)
            ]);

            let mergedData = [];

            if (custSnap.exists()) {
                const custData = custSnap.val();
                const saldoAwalDB = parseFloat(custData.saldoAwal) || 0;
                setInitialMigration(saldoAwalDB);
            } else {
                setInitialMigration(0);
            }

            // Helper Push Data
            const pushData = (snapshot, type, amountField, isDebitDefault, isIncomingCheck = false) => {
                if (snapshot.exists()) {
                    const val = snapshot.val();
                    Object.keys(val).forEach(key => {
                        const item = val[key];
                        let isDebit = isDebitDefault;
                        if (isIncomingCheck) { isDebit = item.arah !== 'IN'; } 

                        let amount = parseFloat(item[amountField]) || 0;

                        // Khusus Invoice hitung bersih
                        if(type === 'INVOICE') {
                             const bruto = parseFloat(item.totalBruto) || 0;
                             const biayaLain = parseFloat(item.totalBiayaLain) || 0;
                             amount = bruto + biayaLain - parseFloat(item.totalDiskon || 0);
                        }

                        mergedData.push({
                            ...item,
                            key: key,
                            type: type,
                            amount: amount,
                            isDebit: isDebit,
                            date: item.tanggal
                        });
                    });
                }
            };

            // A. INVOICES (Manual Push karena logic khusus)
            if (invSnap.exists()) {
                pushData(invSnap, 'INVOICE', null, true); // Logic amount handled inside
            }
            pushData(paySnap, 'PAYMENT', 'totalBayar', false);
            pushData(nfSnap, 'NON_FAKTUR', 'totalBayar', false, true);
            pushData(retSnap, 'RETURN', 'totalRetur', false);

            setRawData(mergedData);

        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- LOGIC CALCULATION (Chronological) ---
    const processedData = useMemo(() => {
        // 1. Sort Wajib Ascending dulu untuk hitung Running Balance yang benar
        const allDataAsc = [...rawData].sort((a, b) => a.date - b.date);

        let startFilter = dateRange?.[0] ? dateRange[0].startOf('day').valueOf() : 0;
        let endFilter = dateRange?.[1] ? dateRange[1].endOf('day').valueOf() : Infinity;

        let runningBalance = initialMigration; 
        let openingBalance = initialMigration; 
        
        let displayList = [];
        let totalDebitRange = 0;
        let totalCreditRange = 0;

        allDataAsc.forEach(item => {
            const amount = item.amount;
            
            // Hitung saldo berjalan
            if (item.isDebit) {
                runningBalance -= amount; 
            } else {
                runningBalance += amount;
            }

            // Logic Filter Date & Search
            if (item.date < startFilter) {
                openingBalance = runningBalance;
            } else if (item.date <= endFilter) {
                const queryStr = searchText.toLowerCase();
                const queryNumeric = searchText.replace(/[^0-9]/g, ''); 

                const matchSearch = 
                    (item.id && item.id.toLowerCase().includes(queryStr)) ||
                    (item.keterangan && item.keterangan.toLowerCase().includes(queryStr)) ||
                    (queryNumeric && item.amount.toString().includes(queryNumeric));

                if (matchSearch) {
                    displayList.push({
                        ...item,
                        balance: runningBalance // Balance ditempel ke transaksi spesifik
                    });

                    if (item.isDebit) totalDebitRange += amount;
                    else totalCreditRange += amount;
                }
            }
        });

        let status = 'LUNAS';
        let statusColor = '#1890ff'; 
        
        if (runningBalance < 0) {
            status = 'HUTANG';
            statusColor = '#cf1322'; 
        } else if (runningBalance > 0) {
            status = 'DEPOSIT';
            statusColor = '#3f8600'; 
        }

        return {
            list: displayList, 
            openingBalance,
            totalDebitRange,
            totalCreditRange,
            finalBalance: runningBalance,
            status,
            statusColor
        };

    }, [rawData, dateRange, searchText, initialMigration]); 

    // --- UPDATE EFFECT: Reset Table & Printable Data ---
    // Efek ini jalan kalau data baru di-fetch atau filter date/search berubah
    useEffect(() => {
        setPrintableData(processedData.list);

        // Auto jump to last page (hanya jika user belum mengacak-acak sort)
        // Kita default ke last page karena flow baca history biasanya chronological
        if (processedData.list.length > 0) {
            const lastPage = Math.ceil(processedData.list.length / pagination.pageSize);
            setPagination(prev => ({ ...prev, current: lastPage }));
        } else {
            setPagination(prev => ({ ...prev, current: 1 }));
        }
    }, [processedData.list]); 

    // --- HANDLE TABLE CHANGE (Sorting & Paging) ---
    const handleTableChange = (newPagination, filters, sorter, extra) => {
        setPagination(newPagination);
        
        // KUNCI UTAMA: Ambil data yang sudah di-sort oleh Ant Design
        // extra.currentDataSource berisi data setelah filter & sorting
        setPrintableData(extra.currentDataSource);
    };

    // --- PRINT ---
    const handlePrint = () => {
        const win = window.open('', '', 'height=700,width=1000');
        
        const formatCurrencyForPrint = (val, isCellEmpty = false) => {
            if (isCellEmpty) return '<div style="text-align: center">-</div>';
            const isNegative = val < 0;
            const absVal = Math.abs(val);
            const numberStr = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(absVal);
            return `<div style="display: flex; justify-content: space-between; width: 100%;"><span></span><span>${isNegative ? '-' : ''}${numberStr}</span></div>`;
        };

        // Gunakan printableData (yang sudah di-sort user)
        const tableRows = printableData.map(item => `
            <tr>
                <td style="white-space: nowrap;">${dayjs(item.date).format('DD MMM YY')}</td>
                <td style="white-space: nowrap;">${item.id}</td>
                <td>${item.type}</td>
                <td>${item.keterangan || ''}</td>
                <td>${!item.isDebit ? formatCurrencyForPrint(item.amount) : formatCurrencyForPrint(0, true)}</td>
                <td>${item.isDebit ? formatCurrencyForPrint(item.amount) : formatCurrencyForPrint(0, true)}</td>
                <td style="font-weight: bold;">${formatCurrencyForPrint(item.balance)}</td>
            </tr>
        `).join('');

        win.document.write('<html><head><title>Cetak Transaksi</title>');
        win.document.write(`
            <style>
                body { font-family: sans-serif; padding: 15px; color: #000; }
                .header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 5px; }
                .header h1 { font-size: 18px; margin: 0; }
                .summary-table, .main-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
                .summary-table td, .main-table th, .main-table td { border: 1px solid #000; padding: 4px; }
                .main-table th { background-color: #f0f0f0; text-align: center; }
            </style>
        `);
        win.document.write('</head><body>');
        win.document.write(`
            <div class="header"><h1>Riwayat Transaksi: ${customer?.nama || 'PELANGGAN'}</h1></div>
            <table class="summary-table">
                <tr><td>Saldo Awal: ${formatCurrencyForPrint(processedData.openingBalance)}</td><td>Total Kredit: ${formatCurrencyForPrint(processedData.totalCreditRange)}</td></tr>
                <tr><td>Saldo Akhir: <b>${formatCurrencyForPrint(processedData.finalBalance)}</b> (${processedData.status})</td><td>Total Debit: ${formatCurrencyForPrint(processedData.totalDebitRange)}</td></tr>
            </table>
            <table class="main-table">
                <thead><tr><th>Tanggal</th><th>ID</th><th>Tipe</th><th>Ket</th><th>Kredit</th><th>Debit</th><th>Saldo</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        `);
        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    };

    // --- COPY IMAGE ---
    const handleCopyToClipboard = async () => {
        if (!paperRef.current) return;
        setCopyLoading(true);
        try {
            const canvas = await html2canvas(paperRef.current, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true
            });
            canvas.toBlob(async (blob) => {
                if (!blob) throw new Error("Gagal blob");
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                message.success("Gambar tersalin (Sesuai Urutan Tabel)!");
            }, 'image/png');
        } catch (err) {
            console.error(err);
            message.error("Gagal menyalin gambar.");
        } finally {
            setCopyLoading(false);
        }
    };

    // --- COLUMNS WITH SORTER ---
    const columns = [
        {
            title: 'Tanggal',
            dataIndex: 'date',
            key: 'date',
            width: 140,
            render: (val) => val ? dayjs(val).format('DD MMMM YYYY') : '-',
            // Sorter Tanggal
            sorter: (a, b) => a.date - b.date,
        },
        {
            title: 'ID Transaksi',
            dataIndex: 'id',
            key: 'id',
            width: 130,
            render: (text) => <Text copyable={{ text: text }} style={{ fontSize: '12px' }}>{text}</Text>,
            // Sorter String ID
            sorter: (a, b) => a.id.localeCompare(b.id),
        },
        {
            title: 'Tipe',
            dataIndex: 'type',
            key: 'type',
            width: 110,
            render: (type) => {
                let color = 'default';
                if(type === 'INVOICE') color = 'blue';
                if(type === 'PAYMENT') color = 'green';
                if(type === 'RETURN') color = 'orange';
                if(type === 'NON_FAKTUR') color = 'purple';
                return <Tag color={color}>{type}</Tag>;
            }
        },
        {
            title: 'Keterangan',
            dataIndex: 'keterangan',
            key: 'keterangan',
            ellipsis: true,
            render: (text) => <span style={{ fontSize: '13px', color: '#666' }}>{text || '-'}</span>
        },
        {
            title: 'Kredit (+)',
            key: 'credit',
            align: 'right',
            width: 130,
            render: (_, record) => !record.isDebit ? <span style={{ color: '#3f8600', fontWeight: 'bold' }}>+ {formatNumber(record.amount)}</span> : '-',
            // Sorter Value Kredit (Jika debit dianggap 0 saat compare)
            sorter: (a, b) => {
                const valA = !a.isDebit ? a.amount : 0;
                const valB = !b.isDebit ? b.amount : 0;
                return valA - valB;
            }
        },
        {
            title: 'Debit (-)',
            key: 'debit',
            align: 'right',
            width: 130,
            render: (_, record) => record.isDebit ? <span style={{ color: '#cf1322', fontWeight: 'bold' }}>- {formatNumber(record.amount)}</span> : '-',
             // Sorter Value Debit
             sorter: (a, b) => {
                const valA = a.isDebit ? a.amount : 0;
                const valB = b.isDebit ? b.amount : 0;
                return valA - valB;
            }
        },
        {
            title: 'Saldo',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right',
            width: 140,
            render: (val) => <span style={{ fontWeight: 'bold', color: val < 0 ? '#cf1322' : '#3f8600' }}>{formatNumber(val)}</span>,
            // Sorter Saldo
            sorter: (a, b) => a.balance - b.balance,
        }
    ];

    // --- DATA SLICE UNTUK IMAGE CAPTURE ---
    // Menggunakan printableData (Data yang tampil di tabel setelah sort/filter)
    // Kita ambil 15 data TERAKHIR dari list yang sedang tampil
    const captureDataList = printableData.length > 15 
        ? printableData.slice(-15) 
        : printableData;

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: 24 }}>
                        <span>Riwayat: {customer?.nama}</span>
                        <Space>
                            <Button 
                                icon={<CopyOutlined />} 
                                loading={copyLoading}
                                onClick={handleCopyToClipboard}
                            >
                                Salin Gambar
                            </Button>
                            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Cetak</Button>
                        </Space>
                    </div>
                }
                open={open}
                onCancel={onCancel}
                width={1400}
                footer={null}
                style={{ top: 20 }}
                bodyStyle={{ padding: '16px 24px' }}
            >
                {/* 1. REKAP ATAS */}
                <Row gutter={16} style={{ marginBottom: 20 }}>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#fafafa', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Saldo Awal" value={processedData.openingBalance} valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: processedData.openingBalance < 0 ? '#cf1322' : '#3f8600' }} formatter={(val) => formatNumber(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#fff1f0', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Total Tagihan (Debit)" value={processedData.totalDebitRange} valueStyle={{ color: '#cf1322', fontSize: '16px' }} prefix={<ArrowUpOutlined />} formatter={(val) => formatNumber(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#f6ffed', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Total Bayar (Kredit)" value={processedData.totalCreditRange} valueStyle={{ color: '#3f8600', fontSize: '16px' }} prefix={<ArrowDownOutlined />} formatter={(val) => formatNumber(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#e6f7ff', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title={<Space><span>Saldo Akhir</span><Tag color={processedData.status === 'HUTANG' ? 'red' : processedData.status === 'DEPOSIT' ? 'green' : 'blue'}>{processedData.status}</Tag></Space>} value={processedData.finalBalance} valueStyle={{ color: processedData.statusColor, fontSize: '18px', fontWeight: 'bold' }} formatter={(val) => formatNumber(val)} />
                        </Card>
                    </Col>
                </Row>

                {/* 2. FILTER & SEARCH */}
                <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
                    <Col flex="auto">
                        <Input placeholder="Cari ID, Keterangan, Nominal..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
                    </Col>
                    <Col>
                        <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates || [null, null])} format="DD MMMM YYYY" />
                    </Col>
                </Row>

                {/* 3. TABEL DATA */}
                {loading ? <div style={{ textAlign: 'center', padding: '40px' }}><Spin size="large" /></div> : 
                    <Table
                        columns={columns}
                        dataSource={processedData.list} // Data source awal (sebelum di-sort tabel)
                        onChange={handleTableChange} // Handle sorting & paging
                        rowKey="key"
                        pagination={{ 
                            current: pagination.current,
                            pageSize: pagination.pageSize,
                            total: processedData.list.length,
                            showSizeChanger: true, 
                            pageSizeOptions: ['15', '20', '50'], 
                            size: "small" 
                        }}
                        size="small"
                        bordered
                        scroll={{ x: 800 }}
                    />
                }
            </Modal>

            {/* ================================================================================= */}
            {/* AREA KHUSUS GENERATE GAMBAR (HIDDEN) */}
            {/* Mengikuti hasil filter & sorting TABEL */}
            {/* ================================================================================= */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                <div 
                    ref={paperRef} 
                    style={{ 
                        width: '800px', padding: '20px', background: '#ffffff', color: '#000000', 
                        fontFamily: 'Arial, sans-serif', border: '1px solid #000' 
                    }}
                >
                    <div style={{ borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                        <h2 style={{ margin: 0, color: '#000' }}>Laporan Singkat Transaksi</h2>
                        <h3 style={{ margin: '5px 0 0 0', color: '#000' }}>Pelanggan: {customer?.nama}</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#000' }}>
                            {dateRange[0] && dateRange[1] 
                                ? `Periode: ${dateRange[0].format('DD MMM YYYY')} - ${dateRange[1].format('DD MMM YYYY')}`
                                : `Dicetak pada: ${dayjs().format('DD MMMM YYYY HH:mm')}`
                            }
                        </p>
                    </div>

                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '12px', color: '#000' }}>
                        Daftar Transaksi (Tampilan Tabel):
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: '#000' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}> 
                                <th style={{ border: '1px solid #000', padding: '6px' }}>Tanggal</th>
                                {/* --- PERUBAHAN DI SINI: MENAMBAHKAN HEADER NO. --- */}
                                <th style={{ border: '1px solid #000', padding: '6px' }}>No.</th>
                                <th style={{ border: '1px solid #000', padding: '6px' }}>Tipe</th>
                                <th style={{ border: '1px solid #000', padding: '6px' }}>Keterangan</th>
                                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Kredit (+)</th>
                                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Debit (-)</th>
                                <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>Saldo*</th>
                            </tr>
                        </thead>
                        <tbody>
                            {captureDataList.length > 0 ? captureDataList.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}>{dayjs(item.date).format('DD MMM YY')}</td>
                                    {/* --- PERUBAHAN DI SINI: MENAMBAHKAN DATA ID --- */}
                                    <td style={{ border: '1px solid #000', padding: '6px' }}>{item.id}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}>{item.type}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px' }}>{item.keterangan || '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{!item.isDebit ? formatNumber(item.amount) : '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{item.isDebit ? formatNumber(item.amount) : '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>{formatNumber(item.balance)}</td>
                                </tr>
                            )) : (
                                // Ubah colSpan jadi 7 karena ada tambahan kolom
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '10px', border: '1px solid #000' }}>Tidak ada data</td></tr>
                            )}
                        </tbody>
                    </table>
                    
                    <div style={{ marginTop: '5px', fontSize: '10px', fontStyle: 'italic', color: '#555' }}>
                        *Kolom Saldo dihitung berdasarkan urutan waktu (kronologis), bukan urutan tampilan sorting.
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', border: '1px solid #000', padding: '10px' }}>
                        <div><div style={{ fontSize: '12px' }}>Saldo Awal (Periode)</div><div style={{ fontWeight: 'bold' }}>{formatNumber(processedData.openingBalance)}</div></div>
                        <div><div style={{ fontSize: '12px' }}>Total Debit</div><div style={{ fontWeight: 'bold' }}>{formatNumber(processedData.totalDebitRange)}</div></div>
                        <div><div style={{ fontSize: '12px' }}>Total Kredit</div><div style={{ fontWeight: 'bold' }}>{formatNumber(processedData.totalCreditRange)}</div></div>
                        <div style={{ borderLeft: '1px solid #000', paddingLeft: '15px' }}><div style={{ fontSize: '12px' }}>Saldo Akhir ({processedData.status})</div><div style={{ fontWeight: 'bold', fontSize: '16px' }}>{formatNumber(processedData.finalBalance)}</div></div>
                    </div>
                </div>
            </div>
        </>
    );
}