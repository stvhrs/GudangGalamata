import React, { useState, useEffect, useMemo } from 'react';
import { 
    Modal, Table, DatePicker, Row, Col, Card, Statistic, Tag, Spin, Empty, Typography, Input, Button, Space 
} from 'antd';
import { 
    ArrowUpOutlined,
    ArrowDownOutlined,
    SearchOutlined,
    PrinterOutlined
} from '@ant-design/icons';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../../api/firebase'; 
import dayjs from 'dayjs';
import 'dayjs/locale/id'; 

// Set locale global ke Indonesia
dayjs.locale('id');

const { RangePicker } = DatePicker;
const { Text } = Typography;

export default function CustomerHistoryModal({ open, onCancel, customer }) {
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState([]);
    
    // --- 1. STATE BARU: Untuk menyimpan Saldo Awal (Migrasi) ---
    const [initialMigration, setInitialMigration] = useState(0);

    // State Filter & Search
    const [dateRange, setDateRange] = useState([null, null]);
    const [searchText, setSearchText] = useState('');

    // State untuk data yang siap print
    const [printableData, setPrintableData] = useState([]); 
    
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
            // Definisikan referensi database
            const invoicesRef = query(ref(db, 'invoices'), orderByChild('customerId'), equalTo(customerId));
            const paymentsRef = query(ref(db, 'payments'), orderByChild('customerId'), equalTo(customerId));
            const nonFakturRef = query(ref(db, 'non_faktur'), orderByChild('customerId'), equalTo(customerId));
            const returnsRef = query(ref(db, 'returns'), orderByChild('customerId'), equalTo(customerId));
            const customerRef = ref(db, `customers/${customerId}`);

            // Fetch semua secara paralel
            const [invSnap, paySnap, nfSnap, retSnap, custSnap] = await Promise.all([
                get(invoicesRef), 
                get(paymentsRef), 
                get(nonFakturRef), 
                get(returnsRef),
                get(customerRef)
            ]);

            let mergedData = [];

            // --- 2. PROSES MIGRASI (AMBIL APA ADANYA / MINUS) ---
            if (custSnap.exists()) {
                const custData = custSnap.val();
                // PERBAIKAN: Hapus Math.abs, biarkan nilai minus tetap minus
                const saldoAwalDB = parseFloat(custData.saldoAwal) || 0;
                setInitialMigration(saldoAwalDB);
            } else {
                setInitialMigration(0);
            }

            // --- PROSES DATA TRANSAKSI LAINNYA ---
            
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
                        isDebit: true, // Debit = Invoice (Mengurangi Saldo/Menambah Hutang)
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

    // --- LOGIC CALCULATION (useMemo) ---
    const processedData = useMemo(() => {
        const allDataAsc = [...rawData].sort((a, b) => a.date - b.date);

        let startFilter = dateRange?.[0] ? dateRange[0].startOf('day').valueOf() : 0;
        let endFilter = dateRange?.[1] ? dateRange[1].endOf('day').valueOf() : Infinity;

        // --- 3. MENERAPKAN SALDO AWAL (MIGRASI) ---
        // Mulai dari saldo migrasi (yang sekarang bisa minus)
        let runningBalance = initialMigration; 
        let openingBalance = initialMigration; 
        
        let displayList = [];
        let totalDebitRange = 0;
        let totalCreditRange = 0;

        allDataAsc.forEach(item => {
            const amount = item.amount;
            
            // PERBAIKAN LOGIKA LOOP:
            // Jika Invoice (Debit), maka Saldo Berkurang (Makin Minus/Hutang Nambah)
            // Jika Bayar (Kredit), maka Saldo Bertambah (Makin Positif/Lunas)
            if (item.isDebit) {
                runningBalance -= amount; 
            } else {
                runningBalance += amount;
            }

            // Cek Filter Tanggal
            if (item.date < startFilter) {
                openingBalance = runningBalance;
            } else if (item.date <= endFilter) {
                const query = searchText.toLowerCase();
                const matchSearch = 
                    (item.id && item.id.toLowerCase().includes(query)) ||
                    (item.keterangan && item.keterangan.toLowerCase().includes(query));

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

        // Tentukan Status Saldo Akhir (LOGIKA DIBALIK)
        // Minus = Hutang
        // Plus = Deposit
        let status = 'LUNAS';
        let statusColor = 'blue';
        
        if (runningBalance < 0) {
            status = 'HUTANG';
            statusColor = '#cf1322'; // Merah
        } else if (runningBalance > 0) {
            status = 'DEPOSIT';
            statusColor = '#3f8600'; // Hijau
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

    // --- FUNGSI PRINT ---
    const handlePrint = () => {
        const totalDebitPrint = printableData.reduce((acc, curr) => acc + (curr.isDebit ? curr.amount : 0), 0);
        const totalCreditPrint = printableData.reduce((acc, curr) => acc + (!curr.isDebit ? curr.amount : 0), 0);

        const win = window.open('', '', 'height=700,width=1000');
        
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
                .header h1 { font-size: 26px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px; }
                .header h2 { font-size: 20px; margin: 5px 0; font-weight: bold; }
                .meta-table { width: 100%; margin-bottom: 20px; font-size: 14px; font-weight: bold; }
                .meta-table td { padding: 4px 0; }
                .summary-box { border: 1px solid #000; padding: 10px; margin-bottom: 20px; font-size: 13px; }
                .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                .main-table th, .main-table td { border: 1px solid #999; padding: 4px; text-align: left; }
                .main-table th { background-color: #eee; text-align: center; font-weight: bold; padding: 6px; }
                .text-right { text-align: right; }
                .total-row td { font-weight: bold; background-color: #f0f0f0; border-top: 2px solid #000; }
                @media print {
                    @page { margin: 10mm; }
                    .header h1 { font-size: 24px; }
                    .main-table { font-size: 9px; } 
                }
            </style>
        `);
        win.document.write('</head><body>');
        
        // Header
        win.document.write(`
            <div class="header">
                <h1>Laporan Riwayat Transaksi</h1>
                <h2>${customer?.nama || ''} - ${customer?.id || ''}</h2>
            </div>
            <table class="meta-table">
                <tr>
                    <td>Periode: ${dateRange[0] ? dayjs(dateRange[0]).format('DD MMMM YYYY') : 'Awal'} s/d ${dateRange[1] ? dayjs(dateRange[1]).format('DD MMMM YYYY') : 'Sekarang'}</td>
                    <td class="text-right">Tgl Cetak: ${dayjs().format('DD MMMM YYYY HH:mm')}</td>
                </tr>
            </table>
        `);

        // Rekap Saldo
        win.document.write(`
            <div class="summary-box">
                <table style="width: 100%">
                    <tr>
                        <td>Saldo Awal: <strong style="color: ${processedData.openingBalance < 0 ? 'red' : 'green'}">${formatRupiah(processedData.openingBalance)}</strong></td>
                        <td class="text-right">
                            Status Akhir: 
                            <span style="color: ${processedData.statusColor}; font-size: 16px; font-weight: bold; border: 1px solid ${processedData.statusColor}; padding: 2px 8px; border-radius: 4px;">
                                ${processedData.status}
                            </span>
                             &nbsp; <strong style="color: ${processedData.statusColor}">${formatRupiah(processedData.finalBalance)}</strong>
                        </td>
                    </tr>
                </table>
            </div>
        `);

        // Tabel Data
        win.document.write(`
            <table class="main-table">
                <thead>
                    <tr>
                        <th style="width: 12%">Tanggal</th>
                        <th style="width: 15%">ID</th>
                        <th style="width: 10%">Tipe</th>
                        <th>Keterangan</th>
                        <th class="text-right" style="width: 12%">Kredit (+)</th>
                        <th class="text-right" style="width: 12%">Debit (-)</th>
                        <th class="text-right" style="width: 15%">Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                    <tr class="total-row">
                        <td colspan="4" class="text-right">TOTAL HALAMAN INI:</td>
                        <td class="text-right" style="color: green">+ ${formatRupiah(totalCreditPrint)}</td>
                        <td class="text-right" style="color: red">- ${formatRupiah(totalDebitPrint)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
        `);

        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(() => {
            win.print();
            win.close();
        }, 500);
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
            sorter: (a, b) => a.id.localeCompare(b.id),
            render: (text) => <Text copyable={{ text: text }} style={{ fontSize: '12px' }}>{text}</Text>
        },
        {
            title: 'Tipe',
            dataIndex: 'type',
            key: 'type',
            width: 110,
            filters: [
                { text: 'Invoice', value: 'INVOICE' },
                { text: 'Bayar', value: 'PAYMENT' },
                { text: 'Retur', value: 'RETURN' },
                { text: 'Non-Faktur', value: 'NON_FAKTUR' },
            ],
            onFilter: (value, record) => record.type === value,
            sorter: (a, b) => a.type.localeCompare(b.type),
            render: (type) => {
                let color = 'default';
                let label = type;
                if(type === 'INVOICE') { color = 'blue'; label = 'Invoice'; }
                if(type === 'PAYMENT') { color = 'green'; label = 'Bayar'; }
                if(type === 'RETURN') { color = 'orange'; label = 'Retur'; }
                if(type === 'NON_FAKTUR') { color = 'purple'; label = 'Non Faktur'; }
                return <Tag color={color}>{label}</Tag>;
            }
        },
        {
            title: 'Keterangan',
            dataIndex: 'keterangan',
            key: 'keterangan',
            ellipsis: true,
            sorter: (a, b) => (a.keterangan || '').localeCompare(b.keterangan || ''),
            render: (text) => <span style={{ fontSize: '13px', color: '#666' }}>{text || '-'}</span>
        },
        {
            title: 'Kredit (+)',
            key: 'credit',
            align: 'right',
            width: 150,
            sorter: (a, b) => {
                const valA = !a.isDebit ? a.amount : 0;
                const valB = !b.isDebit ? b.amount : 0;
                return valA - valB;
            },
            render: (_, record) => (
                !record.isDebit 
                ? <span style={{ color: '#3f8600', fontWeight: 'bold' }}>+ {formatRupiah(record.amount)}</span> 
                : '-'
            )
        },
        {
            title: 'Debit (-)',
            key: 'debit',
            align: 'right',
            width: 150,
            sorter: (a, b) => {
                const valA = a.isDebit ? a.amount : 0;
                const valB = b.isDebit ? b.amount : 0;
                return valA - valB;
            },
            render: (_, record) => (
                record.isDebit 
                ? <span style={{ color: '#cf1322', fontWeight: 'bold' }}>- {formatRupiah(record.amount)}</span> 
                : '-'
            )
        },
        {
            title: 'Saldo',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right',
            width: 140,
            sorter: (a, b) => a.balance - b.balance,
            render: (val) => (
                <span style={{ fontWeight: 'bold', color: val < 0 ? '#cf1322' : '#3f8600' }}>
                    {formatRupiah(val)}
                </span>
            )
        }
    ];

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: 24 }}>
                        <span>Riwayat: {customer?.nama}</span>
                        <Button icon={<PrinterOutlined />} onClick={handlePrint}>Cetak</Button>
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
                            <Statistic 
                                title="Saldo Awal" 
                                value={processedData.openingBalance} 
                                valueStyle={{ 
                                    fontSize: '16px', 
                                    fontWeight: 'bold',
                                    // Merah jika minus (Hutang), Hijau jika plus (Deposit)
                                    color: processedData.openingBalance < 0 ? '#cf1322' : '#3f8600'
                                }} 
                                formatter={(val) => formatRupiah(val)}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#fff1f0', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic 
                                title="Total Tagihan (Debit)" 
                                value={processedData.totalDebitRange} 
                                valueStyle={{ color: '#cf1322', fontSize: '16px' }} 
                                prefix={<ArrowUpOutlined />}
                                formatter={(val) => formatRupiah(val)}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#f6ffed', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic 
                                title="Total Bayar/Retur (Kredit)" 
                                value={processedData.totalCreditRange} 
                                valueStyle={{ color: '#3f8600', fontSize: '16px' }} 
                                prefix={<ArrowDownOutlined />}
                                formatter={(val) => formatRupiah(val)}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card bodyStyle={{ padding: '12px' }} style={{ background: '#e6f7ff', borderRadius: 8 }} size="small" bordered={false}>
                            <Statistic 
                                title={
                                    <Space>
                                        <span>Saldo Akhir</span>
                                        <Tag color={processedData.status === 'HUTANG' ? 'red' : processedData.status === 'DEPOSIT' ? 'green' : 'blue'}>
                                            {processedData.status}
                                        </Tag>
                                    </Space>
                                }
                                value={processedData.finalBalance} 
                                valueStyle={{ color: processedData.statusColor, fontSize: '18px', fontWeight: 'bold' }} 
                                formatter={(val) => formatRupiah(val)}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* 2. FILTER & SEARCH */}
                <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
                    <Col flex="auto">
                        <Input 
                            placeholder="Cari ID Transaksi atau Keterangan..." 
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} 
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col>
                        <RangePicker 
                            value={dateRange}
                            onChange={(dates) => setDateRange(dates || [null, null])}
                            format="DD MMMM YYYY"
                            placeholder={['Mulai', 'Sampai']}
                        />
                    </Col>
                </Row>

                {/* 3. TABEL DATA */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}><Spin size="large" /></div>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={processedData.list}
                        onChange={handleTableChange}
                        rowKey="key"
                        pagination={{ pageSize: 10, size: "small" }}
                        size="small"
                        bordered
                        scroll={{ x: 800 }}
                        locale={{ emptyText: <Empty description="Tidak ada data ditemukan" /> }}
                        rowClassName={(record) => record.type === 'RETURN' ? 'bg-orange-50' : ''}
                    />
                )}
            </Modal>

            <div style={{ display: 'none' }}>
                <div id="printable-area"></div> 
            </div>
        </>
    );
}