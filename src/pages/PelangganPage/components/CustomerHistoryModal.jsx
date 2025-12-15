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

// --- CSS KUSTOM UNTUK TABEL EXCEL LOOK ---
const excelTableStyles = `
  .excel-table .ant-table-container {
    border-left: 2px solid #000 !important;
    border-top: 2px solid #000 !important;
  }
  .excel-table .ant-table-cell {
    border-bottom: 2px solid #000 !important;
    border-right: 2px solid #000 !important;
  }
  .excel-table .ant-table-thead > tr > th {
    background-color: #d9d9d9 !important;
    color: #000 !important;
    font-weight: bold !important;
    border-bottom: 2px solid #000 !important;
  }
`;

// --- HELPER FUNCTIONS ---
const formatCurrency = (value) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

const parseNumber = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(/[^0-9.-]+/g, ""); 
    return Number(cleanStr) || 0;
};

const rangePresets = [
    { label: 'Hari Ini', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
    { label: '7 Hari Terakhir', value: [dayjs().subtract(6, 'days'), dayjs()] },
    { label: 'Bulan Ini', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Bulan Lalu', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
];

const CustomerHistoryModal = ({ open, onCancel, pelanggan }) => {
    const [loading, setLoading] = useState(false);
    const [allTransactions, setAllTransactions] = useState([]); 
    
    // State Filter
    const [searchText, setSearchText] = useState(''); 
    const [dateRange, setDateRange] = useState(null);
    
    // State Summary Global
    const [globalSummary, setGlobalSummary] = useState({ 
        saldoAkhir: 0, 
        totalDebit: 0, 
        totalCredit: 0 
    });

    const getSaldoStyle = (val) => {
        if (val > 0) return { color: '#cf1322', label: 'Hutang' };
        if (val < 0) return { color: '#3f8600', label: 'Deposit' };
        return { color: '#595959', label: 'Lunas' };
    };

    // --- 1. FETCH DATA UTAMA ---
    const fetchHistory = async () => {
        if (!pelanggan) return;
        setLoading(true);
        try {
            // Kita ambil data berdasarkan nama atau ID
            // NOTE: Pastikan di Firebase Rules ".indexOn": ["idPelanggan", "namaPelanggan"] sudah ada untuk performa
            const qInvoice = query(ref(db, 'transaksiJualBuku'), orderByChild('idPelanggan'), equalTo(pelanggan.id));
            const qBayar = query(ref(db, 'historiPembayaran'), orderByChild('namaPelanggan'), equalTo(pelanggan.nama));
            const qRetur = query(ref(db, 'historiRetur'), orderByChild('namaPelanggan'), equalTo(pelanggan.nama));
            const qDp = query(ref(db, 'nonFaktur'), orderByChild('namaPelanggan'), equalTo(pelanggan.nama));

            const [snapInvoice, snapBayar, snapRetur, snapDp] = await Promise.all([
                get(qInvoice), get(qBayar), get(qRetur), get(qDp)
            ]);

            let rawData = [];

            // A. INVOICE
            if (snapInvoice.exists()) {
                snapInvoice.forEach(child => {
                    const val = child.val();
                    // Double check ID pelanggan (Safety)
                    if (val.idPelanggan !== pelanggan.id) return;

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
                    // Safety check nama (Case insensitive)
                    if ((val.namaPelanggan || '').toLowerCase() !== (pelanggan.nama || '').toLowerCase()) return;

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
                    if ((val.namaPelanggan || '').toLowerCase() !== (pelanggan.nama || '').toLowerCase()) return;

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

            // D. DP / DOWN PAYMENT (FIX BUG 300JT)
            if (snapDp.exists()) {
                snapDp.forEach(child => {
                    const val = child.val();
                    
                    // --- SAFETY FILTER: Cegah data orang lain masuk ---
                    // Pastikan nama pelanggan persis sama (atau mirip)
                    const dbName = (val.namaPelanggan || '').trim().toLowerCase();
                    const targetName = (pelanggan.nama || '').trim().toLowerCase();
                    
                    if (dbName !== targetName) {
                        return; // Skip jika bukan milik pelanggan ini
                    }

                    rawData.push({
                        id: child.key,
                        rawId: val.id || child.key, // Ambil ID DP (misal DP998187)
                        dateObj: val.tanggal, // Timestamp (misal 1765430666902)
                        type: 'DP',
                        keterangan: val.keterangan || 'Down Payment (DP)', 
                        debit: 0,
                        credit: parseNumber(val.jumlah) // Menggunakan field 'jumlah' sesuai data Anda
                    });
                });
            }

            // Sort Kronologis (Lama -> Baru) untuk hitung saldo berjalan
            rawData.sort((a, b) => {
                const timeA = dayjs(a.dateObj).valueOf();
                const timeB = dayjs(b.dateObj).valueOf();
                return timeA - timeB;
            });

            let currentBalance = 0;
            let tempTotalDebit = 0;
            let tempTotalCredit = 0;

            const dataWithBalance = rawData.map(item => {
                tempTotalDebit += item.debit;
                tempTotalCredit += item.credit;
                
                // Rumus: Saldo = Saldo Sebelumnya + Tagihan (Debit) - Bayar/Retur/DP (Credit)
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
            
            // Reverse agar yang terbaru muncul paling atas di tabel
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

    // --- 2. LOGIKA FILTER UI ---
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

    // --- 3. SUMMARY DINAMIS (Berdasarkan Filter) ---
    const displaySummary = useMemo(() => {
        const currentDebit = filteredTransactions.reduce((acc, curr) => acc + curr.debit, 0);
        const currentCredit = filteredTransactions.reduce((acc, curr) => acc + curr.credit, 0);

        return {
            totalDebit: currentDebit,      
            totalCredit: currentCredit,   
            saldoAkhir: globalSummary.saldoAkhir // Saldo akhir tetap global (hutang real)
        };
    }, [filteredTransactions, globalSummary.saldoAkhir]);


    // --- 4. GENERATE PDF ---
    const handleDownloadPDF = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(14);
        doc.text("KARTU PIUTANG PELANGGAN", 14, 20);
        
        let periodeStr = "Semua Waktu";
        if(dateRange) {
            periodeStr = `${dateRange[0].format('DD/MM/YY')} s/d ${dateRange[1].format('DD/MM/YY')}`;
        }
        
        doc.setFontSize(10);
        doc.text(`Nama : ${pelanggan.nama}`, 14, 30);
        doc.text(`Periode : ${periodeStr}`, 14, 35);
        
        const tableColumn = ["Tanggal", "ID Transaksi", "Ket.", "Bayar/DP", "Piutang", "Saldo"];
        const tableRows = [];
        
        // Sort data lama -> baru untuk PDF agar alur saldo enak dibaca
        const dataForPdf = [...filteredTransactions].sort((a, b) => dayjs(a.dateObj).valueOf() - dayjs(b.dateObj).valueOf()); 

        dataForPdf.forEach(t => {
            tableRows.push([
                dayjs(t.dateObj).format('DD/MM/YY'),
                t.rawId,
                t.keterangan,
                t.credit > 0 ? formatCurrency(t.credit) : '-',
                t.debit > 0 ? formatCurrency(t.debit) : '-',
                formatCurrency(Math.abs(t.saldo)) 
            ]);
        });

        const footerRow = [
            "TOTAL",                                
            "",                                     
            "",                                     
            formatCurrency(displaySummary.totalCredit),     
            formatCurrency(displaySummary.totalDebit),
            formatCurrency(Math.abs(displaySummary.saldoAkhir))       
        ];

        const getPdfColor = (val) => {
            if (val > 0) return [207, 19, 34]; // Merah
            if (val < 0) return [63, 134, 0];  // Hijau
            return [0, 0, 0];
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
            
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    const rowIndex = data.row.index;
                    const rowData = dataForPdf[rowIndex];
                    if (rowData) {
                        data.cell.styles.textColor = getPdfColor(rowData.saldo);
                    }
                }
                if (data.section === 'foot') {
                    data.cell.styles.fontStyle = 'bold';
                    if (data.column.index === 0) data.cell.styles.halign = 'left';
                    else data.cell.styles.halign = 'right';

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
            sorter: (a, b) => dayjs(a.dateObj).valueOf() - dayjs(b.dateObj).valueOf(),
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
                if(r.type === 'DP') color = 'purple'; 
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
            title: 'Bayar / Retur / VF',
            dataIndex: 'credit',
            key: 'bayar',
            align: 'right',
            width: 140,
            render: (val, r) => {
                if (val > 0) {
                    let color = '#3f8600'; 
                    let tooltip = 'Pembayaran Masuk';

                    if (r.type === 'RETUR') {
                        color = '#d46b08'; 
                        tooltip = 'Pengurangan hutang dari Retur';
                    } else if (r.type === 'DP') {
                        color = '#722ed1'; 
                        tooltip = 'Uang Muka (DP)';
                    }

                    return (
                        <Tooltip title={tooltip}>
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
        <>
            <style>{excelTableStyles}</style>

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
                                    title={<Text type="secondary">Total Bayar/DP (Terfilter)</Text>}
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

                    {/* TABEL DENGAN STYLE EXCEL */}
                    <Table
                        columns={columns}
                        dataSource={filteredTransactions}
                        rowKey="id"
                        pagination={{ pageSize: 8 }}
                        size="small"
                        scroll={{ x: 800 }}
                        bordered
                        className="excel-table" 
                    />
                </Spin>
            </Modal>
        </>
    );
};

export default CustomerHistoryModal;