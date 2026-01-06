import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Modal, Table, DatePicker, Row, Col, Card, Statistic, Tag, Spin, Empty, Typography, Input, Button, Space, message 
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
import html2canvas from 'html2canvas'; // PASTIKAN INSTALL: npm install html2canvas

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

    // State Print & Copy
    const [printableData, setPrintableData] = useState([]); 
    const [copyLoading, setCopyLoading] = useState(false);
    
    // Ref untuk area yang akan dijadikan gambar
    const paperRef = useRef(null);
    
    // Format mata uang
    const formatRupiah = (num) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
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

            // A. INVOICES
            if (invSnap.exists()) {
                const val = invSnap.val();
                Object.keys(val).forEach(key => {
                    const item = val[key];
                    const bruto = parseFloat(item.totalBruto) || 0;
                    const biayaLain = parseFloat(item.totalBiayaLain) || 0;
                    const totalInvoice = bruto + biayaLain - parseFloat(item.totalDiskon || 0);

                    mergedData.push({
                        ...item,
                        key: key,
                        type: 'INVOICE',
                        amount: totalInvoice,
                        isDebit: true, 
                        date: item.tanggal
                    });
                });
            }

            // Helper Push Data
            const pushData = (snapshot, type, amountField, isDebitDefault, isIncomingCheck = false) => {
                if (snapshot.exists()) {
                    const val = snapshot.val();
                    Object.keys(val).forEach(key => {
                        const item = val[key];
                        let isDebit = isDebitDefault;
                        if (isIncomingCheck) { isDebit = item.arah !== 'IN'; } 

                        mergedData.push({
                            ...item,
                            key: key,
                            type: type,
                            amount: parseFloat(item[amountField]) || 0,
                            isDebit: isDebit,
                            date: item.tanggal
                        });
                    });
                }
            };

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

    // --- LOGIC CALCULATION ---
    const processedData = useMemo(() => {
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
            
            if (item.isDebit) {
                runningBalance -= amount; 
            } else {
                runningBalance += amount;
            }

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
                        balance: runningBalance
                    });

                    if (item.isDebit) totalDebitRange += amount;
                    else totalCreditRange += amount;
                }
            }
        });

        let status = 'LUNAS';
        let statusColor = '#1890ff'; // Blue default
        
        if (runningBalance < 0) {
            status = 'HUTANG';
            statusColor = '#cf1322'; 
        } else if (runningBalance > 0) {
            status = 'DEPOSIT';
            statusColor = '#3f8600'; 
        }

        return {
            list: displayList.reverse(), 
            openingBalance,
            totalDebitRange,
            totalCreditRange,
            finalBalance: runningBalance,
            status,
            statusColor
        };

    }, [rawData, dateRange, searchText, initialMigration]); 

    useEffect(() => {
        setPrintableData(processedData.list);
    }, [processedData.list]);

    const handleTableChange = (pagination, filters, sorter, extra) => {
        setPrintableData(extra.currentDataSource);
    };

    // --- FUNGSI PRINT BIASA ---
    const handlePrint = () => {
        const totalDebitPrint = printableData.reduce((acc, curr) => acc + (curr.isDebit ? curr.amount : 0), 0);
        const totalCreditPrint = printableData.reduce((acc, curr) => acc + (!curr.isDebit ? curr.amount : 0), 0);

        const win = window.open('', '', 'height=700,width=1000');
        
        // ... (Kode HTML Print sama seperti sebelumnya) ...
        const tableRows = printableData.map(item => `
            <tr>
                <td>${dayjs(item.date).format('DD MMM YYYY')}</td>
                <td>${item.id}</td>
                <td>${item.type}</td>
                <td>${item.keterangan || ''}</td>
                <td class="text-right" style="color: green">${!item.isDebit ? '+ ' + formatRupiah(item.amount) : '-'}</td>
                <td class="text-right" style="color: red">${item.isDebit ? '- ' + formatRupiah(item.amount) : '-'}</td>
                <td class="text-right" style="font-weight: bold; color: ${item.balance < 0 ? 'red' : 'green'}">${formatRupiah(item.balance)}</td>
            </tr>
        `).join('');

        win.document.write('<html><head><title>Cetak Riwayat Transaksi</title>');
        win.document.write(`
            <style>
                body { font-family: sans-serif; padding: 20px; color: #000; }
                .header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid #000; padding-bottom: 15px; }
                .header h1 { font-size: 26px; margin: 0 0 5px 0; }
                .header h2 { font-size: 20px; margin: 5px 0; font-weight: bold; }
                .summary-box { border: 1px solid #000; padding: 10px; margin-bottom: 20px; font-size: 13px; }
                .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                .main-table th, .main-table td { border: 1px solid #999; padding: 4px; text-align: left; }
                .main-table th { background-color: #eee; text-align: center; font-weight: bold; }
                .text-right { text-align: right; }
            </style>
        `);
        win.document.write('</head><body>');
        win.document.write(`
            <div class="header"><h1>Riwayat Transaksi</h1><h2>${customer?.nama || ''}</h2></div>
            <div class="summary-box">
               Saldo Akhir: <strong>${formatRupiah(processedData.finalBalance)}</strong> (${processedData.status})
            </div>
            <table class="main-table">
                <thead><tr><th>Tanggal</th><th>ID</th><th>Tipe</th><th>Keterangan</th><th>Kredit (+)</th><th>Debit (-)</th><th>Saldo</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        `);
        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    };

    // --- FUNGSI COPY IMAGE (KHUSUS 15 DATA TERBARU) ---
    const handleCopyToClipboard = async () => {
        if (!paperRef.current) return;

        setCopyLoading(true);
        try {
            // 1. Convert DOM hidden area ke Canvas
            const canvas = await html2canvas(paperRef.current, {
                scale: 2, // Resolusi tinggi agar tajam di WA
                backgroundColor: '#ffffff', // Pastikan background putih
                useCORS: true
            });

            // 2. Convert Canvas ke Blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    message.error("Gagal generate gambar.");
                    setCopyLoading(false);
                    return;
                }

                try {
                    // 3. Tulis ke Clipboard
                    const data = [new ClipboardItem({ [blob.type]: blob })];
                    await navigator.clipboard.write(data);
                    message.success("Gambar tersalin! Tekan Ctrl+V di WhatsApp.");
                } catch (err) {
                    console.error("Clipboard Error:", err);
                    message.error("Gagal menyalin. Browser mungkin memblokir akses clipboard.");
                } finally {
                    setCopyLoading(false);
                }
            }, 'image/png');

        } catch (error) {
            console.error("Html2Canvas Error:", error);
            message.error("Gagal memproses gambar.");
            setCopyLoading(false);
        }
    };

    // --- TABLE COLUMNS ---
    const columns = [
        {
            title: 'Tanggal',
            dataIndex: 'date',
            key: 'date',
            width: 140,
            defaultSortOrder: 'descend',
            sorter: (a, b) => a.date - b.date,
            render: (val) => val ? dayjs(val).format('DD MMMM YYYY') : '-'
        },
        {
            title: 'ID Transaksi',
            dataIndex: 'id',
            key: 'id',
            width: 130,
            render: (text) => <Text copyable={{ text: text }} style={{ fontSize: '12px' }}>{text}</Text>
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
            render: (_, record) => !record.isDebit ? <span style={{ color: '#3f8600', fontWeight: 'bold' }}>+ {formatRupiah(record.amount)}</span> : '-'
        },
        {
            title: 'Debit (-)',
            key: 'debit',
            align: 'right',
            width: 130,
            render: (_, record) => record.isDebit ? <span style={{ color: '#cf1322', fontWeight: 'bold' }}>- {formatRupiah(record.amount)}</span> : '-'
        },
        {
            title: 'Saldo',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right',
            width: 140,
            render: (val) => <span style={{ fontWeight: 'bold', color: val < 0 ? '#cf1322' : '#3f8600' }}>{formatRupiah(val)}</span>
        }
    ];

    // Data slice untuk Image Capture (15 Terbaru)
    // processedData.list sudah di-reverse (descending), jadi ambil 0-15
    const captureDataList = processedData.list.slice(0, 15);

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: 24 }}>
                        <span>Riwayat: {customer?.nama}</span>
                        <Space>
                            <Button 
                                icon={<CopyOutlined />} 
                                type="primary" 
                                style={{ background: '#25D366', borderColor: '#25D366' }} // Warna WA
                                loading={copyLoading}
                                onClick={handleCopyToClipboard}
                            >
                                Salin Gambar (15 Data)
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
                {/* 1. REKAP ATAS (Sama seperti sebelumnya) */}
                <Row gutter={16} style={{ marginBottom: 20 }}>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#fafafa', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Saldo Awal" value={processedData.openingBalance} valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: processedData.openingBalance < 0 ? '#cf1322' : '#3f8600' }} formatter={(val) => formatRupiah(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#fff1f0', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Total Tagihan (Debit)" value={processedData.totalDebitRange} valueStyle={{ color: '#cf1322', fontSize: '16px' }} prefix={<ArrowUpOutlined />} formatter={(val) => formatRupiah(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#f6ffed', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title="Total Bayar (Kredit)" value={processedData.totalCreditRange} valueStyle={{ color: '#3f8600', fontSize: '16px' }} prefix={<ArrowDownOutlined />} formatter={(val) => formatRupiah(val)} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#e6f7ff', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic title={<Space><span>Saldo Akhir</span><Tag color={processedData.status === 'HUTANG' ? 'red' : processedData.status === 'DEPOSIT' ? 'green' : 'blue'}>{processedData.status}</Tag></Space>} value={processedData.finalBalance} valueStyle={{ color: processedData.statusColor, fontSize: '18px', fontWeight: 'bold' }} formatter={(val) => formatRupiah(val)} />
                        </Card>
                    </Col>
                </Row>

                {/* 2. FILTER & SEARCH */}
                <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
                    <Col flex="auto">
                        <Input placeholder="Cari ID, Keterangan..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
                    </Col>
                    <Col>
                        <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates || [null, null])} format="DD MMMM YYYY" />
                    </Col>
                </Row>

                {/* 3. TABEL DATA (UI) */}
                {loading ? <div style={{ textAlign: 'center', padding: '40px' }}><Spin size="large" /></div> : 
                    <Table
                        columns={columns}
                        dataSource={processedData.list}
                        onChange={handleTableChange}
                        rowKey="key"
                        pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '20', '50'], size: "small" }}
                        size="small"
                        bordered
                        scroll={{ x: 800 }}
                    />
                }
            </Modal>

            {/* ================================================================================= */}
            {/* AREA KHUSUS GENERATE GAMBAR (TERSEMBUNYI DARI USER, TAPI DI-RENDER OLEH BROWSER) */}
            {/* ================================================================================= */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                <div 
                    ref={paperRef} 
                    style={{ 
                        width: '800px', 
                        padding: '20px', 
                        background: '#ffffff', 
                        fontFamily: 'Arial, sans-serif',
                        border: '1px solid #ddd' // Border luar agar rapi saat dicapture
                    }}
                >
                    {/* Header Gambar */}
                    <div style={{ borderBottom: '2px solid #333', paddingBottom: '10px', marginBottom: '15px' }}>
                        <h2 style={{ margin: 0, color: '#1890ff' }}>Laporan Singkat Transaksi</h2>
                        <h3 style={{ margin: '5px 0 0 0' }}>Pelanggan: {customer?.nama}</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Dicetak pada: {dayjs().format('DD MMMM YYYY HH:mm')}</p>
                    </div>

                    {/* Rekap Saldo Gambar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                        <div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Saldo Awal</div>
                            <div style={{ fontWeight: 'bold', color: processedData.openingBalance < 0 ? 'red' : 'green' }}>{formatRupiah(processedData.openingBalance)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Total Debit</div>
                            <div style={{ fontWeight: 'bold', color: 'red' }}>{formatRupiah(processedData.totalDebitRange)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Total Kredit</div>
                            <div style={{ fontWeight: 'bold', color: 'green' }}>{formatRupiah(processedData.totalCreditRange)}</div>
                        </div>
                        <div style={{ borderLeft: '1px solid #ccc', paddingLeft: '15px' }}>
                            <div style={{ fontSize: '12px', color: '#666' }}>Saldo Akhir ({processedData.status})</div>
                            <div style={{ fontWeight: 'bold', fontSize: '16px', color: processedData.statusColor }}>{formatRupiah(processedData.finalBalance)}</div>
                        </div>
                    </div>

                    {/* Tabel Gambar (Hanya 15 Data) */}
                    <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '12px', color: '#666' }}>15 Transaksi Terakhir (Filtered):</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: '#eee' }}>
                                <th style={{ border: '1px solid #999', padding: '6px' }}>Tanggal</th>
                                <th style={{ border: '1px solid #999', padding: '6px' }}>Tipe</th>
                                <th style={{ border: '1px solid #999', padding: '6px' }}>Keterangan</th>
                                <th style={{ border: '1px solid #999', padding: '6px', textAlign: 'right' }}>Nominal</th>
                                <th style={{ border: '1px solid #999', padding: '6px', textAlign: 'right' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {captureDataList.length > 0 ? captureDataList.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{dayjs(item.date).format('DD MMM YY')}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{item.type}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px' }}>{item.keterangan || '-'}</td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', color: item.isDebit ? 'red' : 'green' }}>
                                        {item.isDebit ? '-' : '+'} {formatRupiah(item.amount)}
                                    </td>
                                    <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(item.balance)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '10px' }}>Tidak ada data</td></tr>
                            )}
                        </tbody>
                    </table>
                    <div style={{ marginTop: '10px', fontSize: '10px', color: '#999', textAlign: 'center' }}>*Screenshot otomatis oleh Sistem*</div>
                </div>
            </div>
        </>
    );
}