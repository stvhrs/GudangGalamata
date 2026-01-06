import React, { useState, useMemo, useCallback, useDeferredValue, useTransition } from 'react';
import {
    Layout, Card, Spin, Input, Row, Col, Tag, Button, Modal,
    App, DatePicker, Space, Tabs, Divider, Grid, Typography, Tooltip
} from 'antd';
import {
    PlusOutlined, PrinterOutlined, ReadOutlined,
    SearchOutlined, CloseCircleOutlined, EyeOutlined, EyeInvisibleOutlined, 
    EditOutlined, LoadingOutlined,
    MenuFoldOutlined, MenuUnfoldOutlined // <-- ICON BARU
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import RawTextPreviewModal from '../../components/RawTextPreviewModal'; 

// --- FIREBASE IMPORTS ---
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../api/firebase';

import useDebounce from '../../hooks/useDebounce';
import TransaksiJualForm from './components/TransaksiJualForm';
import TransaksiJualDetailModal from './components/TransaksiJualDetailModal';
import TransaksiJualTableComponent from './components/TransaksiJualTableComponent';

// IMPORT HELPER RAW TEXT BARU
import { generateTransaksiText } from '../../utils/notaTransaksiText';

// IMPORT HOOK
import { useTransaksiJualStream } from '../../hooks/useFirebaseData';

const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

// --- Helpers ---
const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const normalizeStatus = (s) => {
    if (!s) return 'BELUM';
    const status = s.toUpperCase();
    if (status === 'LUNAS') return 'LUNAS';
    if (status === 'BELUM') return 'BELUM';
    return s;
};

const chipStyle = { padding: '5px 16px', fontSize: '14px', border: '1px solid #d9d9d9', borderRadius: '6px', lineHeight: '1.5', cursor: 'pointer', userSelect: 'none', transition: 'all 0.3s', fontWeight: 500 };

export default function TransaksiJualPage() {
    const { message } = App.useApp();
    const screens = useBreakpoint();
    const [isPending, startTransition] = useTransition();

    // --- STATE CONFIG ---
    const defaultStart = useMemo(() => dayjs().subtract(6, 'month').startOf('day'), []);
    const defaultEnd = useMemo(() => dayjs().endOf('day'), []);

    const [dateRange, setDateRange] = useState([defaultStart, defaultEnd]);
    const [isAllTime, setIsAllTime] = useState(false);
    const [showTotals, setShowTotals] = useState(false);
    
    // --- [BARU] State untuk Toggle Kolom Diskon & Retur ---
    const [showExtraCols, setShowExtraCols] = useState(false);

    // Filter Params
    const filterParams = useMemo(() => {
        if (isAllTime) return { mode: 'all' };
        return {
            mode: 'range',
            startDate: dateRange?.[0] ? dateRange[0].startOf('day').valueOf() : null,
            endDate: dateRange?.[1] ? dateRange[1].endOf('day').valueOf() : null,
        };
    }, [dateRange, isAllTime]);

    // --- DATA FETCHING ---
    const { transaksiList: allTransaksi = [], loadingTransaksi } = useTransaksiJualStream(filterParams);

    // --- State UI ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [selectedStatus, setSelectedStatus] = useState([]);

    const showTotalPagination = useCallback((total, range) => `${range[0]}-${range[1]} dari ${total} transaksi`, []);
    const [pagination, setPagination] = useState({
        current: 1, pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", '25', '50', '100', '200'], showTotal: showTotalPagination
    });

    // --- Modals ---
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [formMode, setFormMode] = useState('create');
    const [editingTx, setEditingTx] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTransaksi, setSelectedTransaksi] = useState(null);

    // --- RAW TEXT PREVIEW STATE ---
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewTitle, setPreviewTitle] = useState('Preview');
    
    // --- STATE LOADING BUTTON ROW ---
    const [printingId, setPrintingId] = useState(null);

    // --- CONCURRENT UI ---
    const deferredAllTransaksi = useDeferredValue(allTransaksi);
    const deferredDebouncedSearch = useDeferredValue(debouncedSearchText);
    const deferredSelectedStatus = useDeferredValue(selectedStatus);
    const isProcessing = (debouncedSearchText !== deferredDebouncedSearch) || (selectedStatus !== deferredSelectedStatus);

    const isFilterActive = useMemo(() => {
        return (
            !!debouncedSearchText ||
            selectedStatus.length > 0 ||
            isAllTime ||
            !dateRange[0].isSame(defaultStart, 'day') ||
            !dateRange[1].isSame(defaultEnd, 'day')
        );
    }, [debouncedSearchText, selectedStatus, isAllTime, dateRange, defaultStart, defaultEnd]);

    const filteredTransaksi = useMemo(() => {
        let data = [...(deferredAllTransaksi || [])];
        if (deferredSelectedStatus.length > 0) {
            data = data.filter((tx) => deferredSelectedStatus.includes(normalizeStatus(tx.statusPembayaran)));
        }
        if (deferredDebouncedSearch) {
            const q = deferredDebouncedSearch.toLowerCase();
            data = data.filter((tx) =>
                (tx.id || '').toLowerCase().includes(q) ||
                (tx.namaCustomer || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q)
            );
        }
        return data.sort((a, b) => (b.tanggal || 0) - (a.tanggal || 0));
    }, [deferredAllTransaksi, deferredSelectedStatus, deferredDebouncedSearch]);

    // --- Footer & Summary ---
    const footerTotals = useMemo(() => {
        const filteredData = filteredTransaksi || [];
        const totals = filteredData.reduce(
            (acc, tx) => ({
                bruto: acc.bruto + Number(tx.totalBruto || 0),
                diskon: acc.diskon + Number(tx.totalDiskon || 0),
                retur: acc.retur + Number(tx.totalRetur || 0),
                biayaLain: acc.biayaLain + Number(tx.totalBiayaLain || 0), 
                netto: acc.netto + Number(tx.totalNetto || 0),
                bayar: acc.bayar + Number(tx.totalBayar || 0),
                sisa: acc.sisa + Number(tx.sisaTagihan || 0) 
            }), { bruto: 0, diskon: 0, retur: 0, biayaLain: 0, netto: 0, bayar: 0, sisa: 0 }
        );
        return {
            totalBruto: totals.bruto, totalDiskon: totals.diskon, totalRetur: totals.retur,
            totalBiayaLain: totals.biayaLain, totalTagihan: totals.netto, totalTerbayar: totals.bayar,
            totalSisa: totals.sisa, totalTransaksi: filteredData.length
        };
    }, [filteredTransaksi]);

    // --- Tab Summary ---
    const TabSummary = useMemo(() => {
        if (screens.xs) return null;
        const renderValue = (val, style = {}) => {
            if (showTotals) return <Text strong style={style}>{formatCurrency(val)}</Text>;
            return <Text strong style={{ ...style, fontFamily: 'monospace', letterSpacing: '2px' }}>••••••••</Text>;
        };
        const separator = <Divider type="vertical" style={{ height: '24px', margin: '0 12px' }} />;
        return (
            <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: '8px' }}>
                <Tooltip title={showTotals ? "Sembunyikan Nominal" : "Tampilkan Nominal"}>
                    <Button type="text" shape="circle" icon={showTotals ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => setShowTotals(!showTotals)} />
                </Tooltip>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Bruto</Text>{renderValue(footerTotals.totalBruto)}</div>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Diskon</Text>{renderValue(footerTotals.totalDiskon, { color: '#faad14' })}</div>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Retur</Text>{renderValue(footerTotals.totalRetur, { color: '#cf1322' })}</div>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Netto</Text>{renderValue(footerTotals.totalTagihan, { color: '#1677ff' })}</div>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Bayar</Text>{renderValue(footerTotals.totalTerbayar, { color: '#3f8600' })}</div>
                {separator}
                <div style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Sisa</Text>{renderValue(footerTotals.totalSisa, { color: footerTotals.totalSisa > 0 ? '#cf1322' : '#3f8600' })}</div>
            </div>
        );
    }, [footerTotals, screens.xs, showTotals]);

    // --- Handlers ---
    const handleSearchChange = useCallback((e) => { setSearchText(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleDateChange = useCallback((dates) => { setIsAllTime(false); setDateRange(dates); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleToggleAllTime = useCallback((checked) => { setIsAllTime(checked); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const resetFilters = useCallback(() => { setSearchText(''); setSelectedStatus([]); setIsAllTime(false); setDateRange([defaultStart, defaultEnd]); }, [defaultStart, defaultEnd]);
    const handleTableChange = useCallback((p, f) => { setPagination(p); setSelectedStatus(f.statusPembayaran || []); }, []);

    const handleOpenCreate = useCallback(() => { setFormMode('create'); setEditingTx(null); setIsFormModalOpen(true); }, []);
    const handleOpenEdit = useCallback((tx) => { setFormMode('edit'); setEditingTx(tx); setIsFormModalOpen(true); }, []);
    const handleCloseFormModal = useCallback(() => { setIsFormModalOpen(false); setEditingTx(null); }, []);
    const handleFormSuccess = useCallback(() => { handleCloseFormModal(); }, [handleCloseFormModal]);
    const handleOpenDetailModal = useCallback((tx) => { setSelectedTransaksi(tx); setIsDetailModalOpen(true); }, []);
    const handleCloseDetailModal = useCallback(() => { setSelectedTransaksi(null); setIsDetailModalOpen(false); }, []);

    // --- FETCH ITEM HELPER ---
    const fetchInvoiceItems = async (invoiceId) => {
        try {
            const dbRef = ref(db, 'invoice_items');
            const q = query(dbRef, orderByChild('invoiceId'), equalTo(invoiceId));
            const snapshot = await get(q);
            if (snapshot.exists()) return Object.values(snapshot.val());
            const invSnap = await get(ref(db, `invoices/${invoiceId}/items`));
            if (invSnap.exists()) {
                const raw = invSnap.val();
                return Array.isArray(raw) ? raw : Object.values(raw);
            }
            return [];
        } catch (error) {
            console.error("Error fetching invoice items:", error);
            throw error;
        }
    };

    // --- RAW TEXT GENERATION & PRINT ---
    const handleShowPreview = async (tx, type) => {
        setPrintingId(tx.id); 
        setLoadingPreview(true);
        setPreviewTitle(type === 'INVOICE' ? 'Preview Invoice' : 'Preview Nota');
        try {
            const items = await fetchInvoiceItems(tx.id);
            const rawText = generateTransaksiText(tx, items, type || 'NOTA');
            setPreviewContent(rawText);
            setIsPreviewOpen(true);
        } catch (e) {
            console.error(e);
            message.error("Gagal generate data: " + e.message);
        } finally {
            setLoadingPreview(false);
            setPrintingId(null); 
        }
    };
// --- HANDLE REAL PRINT (Browser Print) ---
    const handlePrintFromPreview = () => {
        if (!previewContent) return;

        // Gunakan _blank agar aman di beberapa browser
        const printWindow = window.open('', '_blank', 'width=950,height=600');
        
        const style = `
            <style>
                @page {
                    /* Biarkan Driver Printer yang menentukan ukuran kertas */
                    /* Kita set margin 0 agar CSS kita yang atur posisi */
                    size: auto; 
                    margin: 0mm; 
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;  /* Lebar mengikuti kertas yang dipilih user */
                    height: 100%;
                }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 13px; 
                    line-height: 1.18;
                    
                    /* --- TEKNIK AUTO CENTER --- */
                    display: flex;           /* Jadikan body sebagai container flex */
                    justify-content: center; /* Tengahkan isi secara Horizontal (Kiri-Kanan) */
                    align-items: flex-start; /* Mulai dari atas (jangan ditengah vertikal) */
                    padding-top: 0.1in;      /* Beri jarak sedikit dari bibir atas kertas */
                }
                
                /* Wrapper untuk teks Nota */
                #nota-container {
                    white-space: pre;       /* Wajib: Agar spasi nota tidak hancur */
                    width: fit-content;     /* Lebar menyesuaikan panjang teks */
                    text-align: left;       /* Teks di dalam nota tetap rata kiri sesuai format pad() */
                    
                    /* Opsi: Tambah border tipis saat debug agar kelihatan batasnya (hapus nanti) */
                    /* border: 1px dashed #ccc; */ 
                }

                @media print {
                    body { -webkit-print-color-adjust: exact; }
                }
            </style>
        `;

        printWindow.document.write('<html><head><title>Print Nota</title>' + style + '</head><body>');
        
        // PENTING: Bungkus previewContent dengan div container
        printWindow.document.write('<div id="nota-container">');
        printWindow.document.write(previewContent);
        printWindow.document.write('</div>');
        
        printWindow.document.write('</body></html>');
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };
    // --- KOLOM AKSI ---
    const renderAksi = useCallback((_, record) => {
        const isPrinting = printingId === record.id;
        
        return (
            <Space size="small">
                <Tooltip title="Lihat Detail">
                    <Button 
                        size="small" 
                        type="text" 
                        icon={<EyeOutlined />} 
                        style={{ color: '#1890ff' }} 
                        onClick={() => handleOpenDetailModal(record)} 
                    />
                </Tooltip>
                
                <Tooltip title="Edit Transaksi">
                    <Button 
                        size="small" 
                        type="text" 
                        icon={<EditOutlined />} 
                        style={{ color: '#faad14' }} 
                        onClick={() => handleOpenEdit(record)} 
                    />
                </Tooltip>
                
                <Tooltip title="Cetak Nota (Dot Matrix)">
                    <Button 
                        size="small" 
                        type="text" 
                        icon={isPrinting ? <LoadingOutlined /> : <PrinterOutlined />} 
                        loading={isPrinting}
                        style={{ color: '#52c41a' }} 
                        onClick={() => handleShowPreview(record, 'NOTA')} 
                    />
                </Tooltip>
            </Space>
        );
    }, [handleOpenDetailModal, handleOpenEdit, printingId]);

    // --- CONFIG COLUMNS DENGAN TOGGLE ---
    const columns = useMemo(() => [
        { title: 'No.', width: 30, fixed: 'left', render: (_t, _r, idx) => ((pagination.current - 1) * pagination.pageSize) + idx + 1 },
        { title: 'Tanggal', dataIndex: 'tanggal', width: 80, render: formatDate, sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0) },
        { title: 'ID', dataIndex: 'id', width: 100, render: (id) => <Text copyable={{ text: id }}>{id}</Text>, sorter: (a, b) => (a.id || '').localeCompare(b.id || '') },
        { title: 'Customer', dataIndex: 'namaCustomer', width: 120, sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || '') },
        
        // --- MODIFIKASI: KOLOM BRUTO DENGAN BUTTON TOGGLE ---
        { 
            title: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    Bruto
                    <Tooltip title={showExtraCols ? "Sembunyikan Detail (Diskon & Retur)" : "Tampilkan Detail (Diskon & Retur)"}>
                        <Button 
                            type="text" 
                            size="small" 
                            icon={showExtraCols ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} 
                            onClick={(e) => {
                                e.stopPropagation(); 
                                setShowExtraCols(!showExtraCols);
                            }}
                            style={{ color: '#1890ff', backgroundColor: '#e6f7ff' }}
                        />
                    </Tooltip>
                </div>
            ), 
            dataIndex: 'totalBruto', 
            align: 'right', 
            width: 100, // Lebarkan dikit biar tombol muat
            render: formatCurrency, 
            sorter: (a, b) => (a.totalBruto || 0) - (b.totalBruto || 0) 
        },

        // --- KOLOM DISKON (CONDITIONAL) ---
        ...(showExtraCols ? [{ 
            title: 'Dsc', 
            dataIndex: 'totalDiskon', 
            align: 'right', 
            width: 90, 
            render: (val) => <span style={{ color: '#faad14' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span> 
        }] : []),

        // --- KOLOM RETUR (CONDITIONAL) ---
        ...(showExtraCols ? [{ 
            title: 'Retur', 
            dataIndex: 'totalRetur', 
            align: 'right', 
            width: 90, 
            render: (val) => <span style={{ color: '#cf1322' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span> 
        }] : []),

        { title: 'Netto', dataIndex: 'totalNetto', align: 'right', width: 100, render: (val) => <Text strong>{formatCurrency(val)}</Text> },
        { title: 'Bayar', dataIndex: 'totalBayar', align: 'right', width: 100, render: (val) => <span style={{ color: '#3f8600' }}>{formatCurrency(val)}</span> },
        { title: 'Sisa', dataIndex: 'sisaTagihan', align: 'right', width: 100, sorter: (a, b) => (a.sisaTagihan || 0) - (b.sisaTagihan || 0), render: (val) => <span style={{ color: val > 0 ? '#cf1322' : '#3f8600', fontWeight: val > 0 ? 'bold' : 'normal' }}>{formatCurrency(val)}</span> },
        { title: 'Status', dataIndex: 'statusPembayaran', width: 60, filters: [{ text: 'BELUM', value: 'BELUM' }, { text: 'LUNAS', value: 'LUNAS' }], filteredValue: selectedStatus.length ? selectedStatus : null, render: (s) => <Tag color={normalizeStatus(s) === 'LUNAS' ? 'green' : normalizeStatus(s) === 'BELUM' ? 'red' : 'orange'}>{normalizeStatus(s)}</Tag> },
        { 
            title: 'Aksi', 
            align: 'center', 
            width: 100, 
            fixed: 'right', 
            render: renderAksi 
        },
    ], [pagination, renderAksi, selectedStatus, showExtraCols]); // dependency: showExtraCols

    const tableScrollX = 1600; 
    const isLoading = loadingTransaksi || isPending || isProcessing;

    const tabItems = [
        {
            key: '1',
            label: <Space><ReadOutlined /> Daftar Transaksi</Space>,
            children: (
                <Card bodyStyle={{ padding: screens.xs ? '12px' : '24px' }}>
                    <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 24 }}>
                        <Col xs={24} md={8} lg={6}>
                            <Input placeholder="Cari Invoice / Customer..." prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} value={searchText} onChange={handleSearchChange} allowClear />
                        </Col>
                        <Col xs={24} md={16} lg={18}>
                            <div style={{ display: 'flex', justifyContent: screens.xs ? 'flex-start' : 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isFilterActive && <Button icon={<CloseCircleOutlined />} danger type="text" size="small" onClick={resetFilters}>Reset</Button>}
                                    <Tag.CheckableTag style={{ ...chipStyle, backgroundColor: isAllTime ? '#1890ff' : 'transparent', color: isAllTime ? '#fff' : 'black' }} checked={isAllTime} onChange={handleToggleAllTime}>Semua</Tag.CheckableTag>
                                    <RangePicker format="D MMM YYYY" value={dateRange} onChange={handleDateChange} disabled={isAllTime} allowClear={false} style={{ width: 240 }} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>Tambah</Button>
                                </div>
                            </div>
                        </Col>
                    </Row>

                    <Spin spinning={isLoading} tip="Memproses data..." size="large" style={{ minHeight: 200 }}>
                        <TransaksiJualTableComponent columns={columns} dataSource={filteredTransaksi} loading={false} pagination={pagination} handleTableChange={handleTableChange} tableScrollX={tableScrollX} rowClassName={(r, i) => (i % 2 === 0 ? 'table-row-even' : 'table-row-odd')} />
                    </Spin>
                </Card>
            )
        }
    ];

    return (
        <Layout>
            <Content style={{ padding: screens.xs ? '12px' : '24px', backgroundColor: '#f0f2f5' }}>
                <Tabs defaultActiveKey="1" type="card" items={tabItems} tabBarExtraContent={TabSummary} destroyInactiveTabPane={false} />

                {isFormModalOpen && (
                    <TransaksiJualForm key={editingTx?.id || 'create'} open={isFormModalOpen} onCancel={handleCloseFormModal} mode={formMode} initialTx={editingTx} onSuccess={handleFormSuccess} />
                )}

                <TransaksiJualDetailModal open={isDetailModalOpen} onCancel={handleCloseDetailModal} transaksi={selectedTransaksi} />

                <RawTextPreviewModal
                    visible={isPreviewOpen}
                    onCancel={() => setIsPreviewOpen(false)}
                    content={previewContent}
                    loading={loadingPreview}
                    title={previewTitle}
                    onPrint={handlePrintFromPreview}
                />
            </Content>
        </Layout>
    );
}