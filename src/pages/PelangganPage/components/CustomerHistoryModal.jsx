import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Table, Button, Typography, Tag, Spin, message, Statistic, Card, Row, Col, Input, Divider, Tooltip, DatePicker } from 'antd';
import { FilePdfOutlined, SearchOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../../api/firebase'; 
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONFIGURASI AWAL ---
dayjs.extend(isBetween); 
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- HELPER FUNCTIONS ---
const formatCurrency = (value) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const parseNumber = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(/[^0-9.-]+/g, ""); 
    return Number(cleanStr) || 0;
};

// Preset Tanggal
const rangePresets = [
    { label: 'Hari Ini', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
    { label: '7 Hari Terakhir', value: [dayjs().subtract(6, 'days'), dayjs()] },
    { label: 'Bulan Ini', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Bulan Lalu', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
];

const CustomerHistoryModal = ({ open, onCancel, pelanggan }) => {
    const [loading, setLoading] = useState(false);
    const [allTransactions, setAllTransactions] = useState([]); 
    
    // --- STATE FILTER ---
    const [searchText, setSearchText] = useState(''); 
    const [dateRange, setDateRange] = useState(null);
    
    // --- STATE SUMMARY GLOBAL ---
    const [globalSummary, setGlobalSummary] = useState({ 
        saldoAkhir: 0, 
        totalDebit: 0, 
        totalCredit: 0 
    });

    // Helper Style: Merah (Hutang), Hijau (Deposit)
    const getSaldoStyle = (val) => {
        if (val > 0) return { color: '#cf1322', label: 'Hutang' }; // Merah
        if (val < 0) return { color: '#3f8600', label: 'Deposit' }; // Hijau
        return { color: '#595959', label: 'Lunas' };
    };

    // --- 1. FETCH DATA ---
    const fetchHistory = async () => {
        if (!pelanggan) return;
        setLoading(true);
        try {
            const qInvoice = query(ref(db, 'transaksiJualBuku'), orderByChild('idPelanggan'), equalTo(pelanggan.id));
            const qBayar = query(ref(db, 'historiPembayaran'), orderByChild('namaPelanggan'), equalTo(pelanggan.nama));
            const qRetur = query(ref(db, 'historiRetur'), orderByChild('namaPelanggan'), equalTo(pelanggan.nama));

            const [snapInvoice, snapBayar, snapRetur] = await Promise.all([
                get(qInvoice), get(qBayar), get(qRetur)
            ]);

            let rawData = [];

            // A. INVOICE
            if (snapInvoice.exists()) {
                snapInvoice.forEach(child => {
                    const val = child.val();
                    rawData.push({
                        id: child.key,
                        rawId: val.nomorInvoice || child.key,
                        dateObj: val.tanggal,
                        type: 'INVOICE',
                        keterangan: 'Pembelian Buku',
                        debit: parseNumber(val.totalTagihan), 
                        credit: 0 
                    });
                });
            }

            // B. PEMBAYARAN
            if (snapBayar.exists()) {
                snapBayar.forEach(child => {
                    const val = child.val();
                    rawData.push({
                        id: child.key,
                        rawId: val.id || child.key,
                        dateObj: val.tanggal,
                        type: 'PAYMENT',
                        keterangan: val.keterangan || 'Pembayaran',
                        debit: 0,
                        credit: parseNumber(val.jumlah) 
                    });
                });
            }

            // C. RETUR
            if (snapRetur.exists()) {
                snapRetur.forEach(child => {
                    const val = child.val();
                    rawData.push({
                        id: child.key,
                        rawId: val.id || child.key,
                        dateObj: val.timestamp || val.tanggal, 
                        type: 'RETUR',
                        keterangan: 'Retur Barang', 
                        debit: 0,
                        credit: parseNumber(val.jumlahKeluar) 
                    });
                });
            }

            // Sort Kronologis (Lama -> Baru)
            rawData.sort((a, b) => a.dateObj - b.dateObj);

            let currentBalance = 0;
            let tempTotalDebit = 0;
            let tempTotalCredit = 0;

            const dataWithBalance = rawData.map(item => {
                tempTotalDebit += item.debit;
                tempTotalCredit += item.credit;
                // Rumus Internal: Debit - Credit
                currentBalance = currentBalance + item.debit - item.credit;
                
                return {
                    ...item,
                    saldo: currentBalance
                };
            });

            setGlobalSummary({ 
                saldoAkhir: currentBalance,
                totalDebit: tempTotalDebit,
                totalCredit: tempTotalCredit
            });
            
            // Reverse agar tabel UI menampilkan data terbaru di atas
            setAllTransactions(dataWithBalance.reverse());

        } catch (error) {
            console.error("Error fetch history:", error);
            message.error("Gagal memuat data histori");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && pelanggan) {
            setSearchText(''); 
            setDateRange(null);
            fetchHistory();
        }
    }, [open, pelanggan]);

    const handleResetFilter = () => {
        setSearchText('');
        setDateRange(null);
    };

    // --- 2. LOGIKA FILTER ---
    const filteredTransactions = useMemo(() => {
        let data = allTransactions;

        if (searchText) {
            const lower = searchText.toLowerCase();
            data = data.filter(item => 
                (item.rawId && item.rawId.toLowerCase().includes(lower)) ||
                (item.type && item.type.toLowerCase().includes(lower)) ||
                (item.keterangan && item.keterangan.toLowerCase().includes(lower))
            );
        }

        if (dateRange && dateRange[0] && dateRange[1]) {
            const start = dateRange[0].startOf('day');
            const end = dateRange[1].endOf('day');
            data = data.filter(item => {
                const itemDate = dayjs(item.dateObj);
                return itemDate.isAfter(start.subtract(1, 'second')) && itemDate.isBefore(end.add(1, 'second'));
            });
        }

        return data;
    }, [allTransactions, searchText, dateRange]);

    // --- 3. SUMMARY DINAMIS ---
    const displaySummary = useMemo(() => {
        const currentDebit = filteredTransactions.reduce((acc, curr) => acc + curr.debit, 0);
        const currentCredit = filteredTransactions.reduce((acc, curr) => acc + curr.credit, 0);

        return {
            totalDebit: currentDebit,      
            totalCredit: currentCredit,   
            saldoAkhir: globalSummary.saldoAkhir 
        };
    }, [filteredTransactions, globalSummary.saldoAkhir]);


    // --- 4. GENERATE PDF ---
    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        
        // --- HEADER ---
        doc.setFontSize(14);
        doc.text("KARTU PIUTANG PELANGGAN", 14, 20);
        
        let periodeStr = "Semua Waktu";
        if(dateRange) {
            periodeStr = `${dateRange[0].format('DD/MM/YY')} s/d ${dateRange[1].format('DD/MM/YY')}`;
        }
        
        doc.setFontSize(10);
        doc.text(`Nama : ${pelanggan.nama}`, 14, 30);
        doc.text(`Periode : ${periodeStr}`, 14, 35);
        
        // --- DATA TABEL ---
        const tableColumn = ["Tanggal", "ID Transaksi", "Ket.", "Bayar", "Piutang", "Saldo"];
        const tableRows = [];
        
        // Sort data lama -> baru
        const dataForPdf = [...filteredTransactions].sort((a, b) => a.dateObj - b.dateObj); 

        dataForPdf.forEach(t => {
            tableRows.push([
                dayjs(t.dateObj).format('DD/MM/YY'),
                t.rawId,
                t.keterangan,
                t.credit > 0 ? formatCurrency(t.credit) : '-',
                t.debit > 0 ? formatCurrency(t.debit) : '-',
                // TAMPILKAN NILAI MUTLAK (Tanpa Minus) di Text PDF
                formatCurrency(Math.abs(t.saldo)) 
            ]);
        });

        // --- FOOTER ROW ---
        const footerRow = [
            "TOTAL",                                        
            "",                                             
            "",                                             
            formatCurrency(displaySummary.totalCredit),     
            formatCurrency(displaySummary.totalDebit),
            // TAMPILKAN NILAI MUTLAK DI FOOTER
            formatCurrency(Math.abs(displaySummary.saldoAkhir))       
        ];

        // Helper Warna untuk PDF
        const getPdfColor = (val) => {
            if (val > 0) return [207, 19, 34]; // Merah (Hutang)
            if (val < 0) return [63, 134, 0];  // Hijau (Deposit)
            return [0, 0, 0]; // Hitam
        };

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            foot: [footerRow], 
            startY: 45,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                3: { halign: 'right' }, 
                4: { halign: 'right' }, 
                5: { halign: 'right', fontStyle: 'bold' }
            },
            
            // --- LOGIKA WARNA (AUTO TABLE) ---
            didParseCell: (data) => {
                // A. Bagian BODY (Baris Data)
                if (data.section === 'body' && data.column.index === 5) {
                    const rowIndex = data.row.index;
                    const rowData = dataForPdf[rowIndex];
                    
                    if (rowData) {
                        // Cek logic warna pakai nilai asli (plus/minus), tapi teks sudah dimutlakkan di tableRows
                        data.cell.styles.textColor = getPdfColor(rowData.saldo);
                    }
                }

                // B. Bagian FOOTER (Baris Total)
                if (data.section === 'foot') {
                    data.cell.styles.fontStyle = 'bold';
                    
                    if (data.column.index === 0) {
                        data.cell.styles.halign = 'left';
                    } else {
                        data.cell.styles.halign = 'right';
                    }

                    // Warna Kolom Saldo Akhir (Index 5)
                    if (data.column.index === 5) {
                        data.cell.styles.textColor = getPdfColor(displaySummary.saldoAkhir);
                    }
                }
            },
            
            footStyles: {
                fillColor: [240, 240, 240], 
                textColor: [0, 0, 0],       
            }
        });

        doc.save(`Kartu_Piutang_${pelanggan.nama}.pdf`);
    };

    // --- KOLOM TABEL UI ---
    const columns = [
        {
            title: 'Tgl',
            dataIndex: 'dateObj',
            key: 'tanggal',
            width: 100,
            render: (val) => dayjs(val).format('DD MMM YY'),
            sorter: (a, b) => a.dateObj - b.dateObj,
        },
        {
            title: 'ID Transaksi',
            dataIndex: 'rawId',
            key: 'idTransaksi',
            width: 140,
            render: (text, r) => {
                let color = 'default';
                if(r.type === 'INVOICE') color = 'blue';
                if(r.type === 'PAYMENT') color = 'green';
                if(r.type === 'RETUR') color = 'orange'; 
                return <Tag color={color}>{text}</Tag>
            },
        },
        {
            title: 'Keterangan',
            dataIndex: 'keterangan',
            key: 'keterangan',
            width: 150,
        },
        {
            title: 'Bayar / Retur',
            dataIndex: 'credit',
            key: 'bayar',
            align: 'right',
            width: 130,
            render: (val, r) => {
                if (val > 0) {
                    const color = r.type === 'RETUR' ? '#d46b08' : '#3f8600';
                    return (
                        <Tooltip title={r.type === 'RETUR' ? 'Pengurangan hutang dari Retur' : 'Pembayaran Masuk'}>
                             <Text style={{color: color, fontWeight: 'bold'}}>{formatCurrency(val)}</Text>
                        </Tooltip>
                    );
                }
                return '-';
            },
            sorter: (a, b) => a.credit - b.credit,
        },
        {
            title: 'Tagihan',
            dataIndex: 'debit',
            key: 'piutang',
            align: 'right',
            width: 130,
            render: (val) => val > 0 ? <Text style={{color: '#cf1322'}}>{formatCurrency(val)}</Text> : '-',
            sorter: (a, b) => a.debit - b.debit,
        },
        {
            title: 'Saldo',
            dataIndex: 'saldo',
            key: 'saldo',
            align: 'right',
            width: 140,
            render: (val) => {
                const style = getSaldoStyle(val);
                return (
                    <Text strong style={{ color: style.color }}>
                        {/* TAMPILKAN ABSOLUTE VALUE (POSITIF) DI UI */}
                        {formatCurrency(Math.abs(val))}
                    </Text>
                )
            },
            sorter: (a, b) => a.saldo - b.saldo,
        }
    ];

    const saldoStatus = getSaldoStyle(displaySummary.saldoAkhir);
    const titleSaldo = displaySummary.saldoAkhir < 0 ? "Sisa Saldo (Deposit)" : "Sisa Saldo (Hutang)";

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Riwayat Transaksi: {pelanggan?.nama}</span>
                    {displaySummary.saldoAkhir < 0 && <Tag color="green">DEPOSIT</Tag>}
                    {displaySummary.saldoAkhir > 0 && <Tag color="red">HUTANG</Tag>}
                </div>
            }
            open={open}
            onCancel={onCancel}
            width={1000}
            footer={[
                <Button key="close" onClick={onCancel}>Tutup</Button>,
                <Button key="pdf" type="primary" icon={<FilePdfOutlined />} onClick={handleDownloadPDF} disabled={filteredTransactions.length === 0}>
                    Download PDF
                </Button>
            ]}
        >
            <Spin spinning={loading}>
                {/* SUMMARY CARD */}
                <Card style={{ marginBottom: 16, background: '#f5f5f5', border: `1px solid ${saldoStatus.color}` }} bodyStyle={{ padding: '16px' }}>
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={8}>
                            <Statistic 
                                title={<Text type="secondary">Total Tagihan (Terfilter)</Text>}
                                value={displaySummary.totalDebit} 
                                precision={0}
                                valueStyle={{ color: '#cf1322' }} 
                                prefix="Rp"
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <Statistic 
                                title={<Text type="secondary">Total Bayar (Terfilter)</Text>}
                                value={displaySummary.totalCredit} 
                                precision={0}
                                valueStyle={{ color: '#3f8600' }} 
                                prefix="Rp"
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <Statistic 
                                title={
                                    <div style={{display:'flex', justifyContent:'space-between'}}>
                                        <span>{titleSaldo} (Global)</span>
                                        <Tooltip title="Saldo ini adalah total hutang saat ini (tidak terpengaruh filter tanggal)">
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </div>
                                }
                                // TAMPILKAN ABSOLUTE VALUE (POSITIF) DI STATISTIC CARD
                                value={Math.abs(displaySummary.saldoAkhir)} 
                                precision={0}
                                valueStyle={{ color: saldoStatus.color, fontWeight: 'bold' }} 
                                prefix="Rp"
                            />
                        </Col>
                    </Row>
                    
                    <Divider style={{ margin: '12px 0' }} />
                    
                    {/* INPUT FILTER AREA */}
                    <Row gutter={[12, 12]} align="middle">
                        <Col xs={24} md={10}>
                            <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                Filter Tanggal:
                            </Text>
                            <RangePicker 
                                style={{ width: '100%' }}
                                value={dateRange}
                                onChange={(dates) => setDateRange(dates)}
                                format="DD/MM/YYYY"
                                presets={rangePresets} 
                                placeholder={['Mulai', 'Sampai']}
                            />
                        </Col>

                        <Col xs={24} md={10}>
                            <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                                Pencarian:
                            </Text>
                            <Input
                                placeholder="Cari ID / Ket..."
                                prefix={<SearchOutlined />}
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                allowClear
                            />
                        </Col>

                        <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <Button 
                                icon={<ReloadOutlined />} 
                                onClick={handleResetFilter}
                                block
                                disabled={!searchText && !dateRange}
                                title="Reset Filter"
                            >
                                Reset
                            </Button>
                        </Col>
                    </Row>
                </Card>

                <Table
                    columns={columns}
                    dataSource={filteredTransactions}
                    rowKey="id"
                    pagination={{ pageSize: 8 }}
                    size="small"
                    scroll={{ x: 800 }}
                />
            </Spin>
        </Modal>
    );
};

export default CustomerHistoryModal;