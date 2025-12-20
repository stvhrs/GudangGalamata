import React, { useState, useMemo, useCallback, useDeferredValue, useTransition } from 'react';
import {
    Layout, Card, Spin, Input, Row, Col, Tag, Button, Modal,
    Dropdown, App, DatePicker, Space, Tabs, Divider, Grid, Empty, Typography, Tooltip
} from 'antd';
import {
    PlusOutlined, MoreOutlined, PrinterOutlined, ReadOutlined,
    PullRequestOutlined, SearchOutlined, CloseCircleOutlined,
    DownloadOutlined, ShareAltOutlined,
    EyeOutlined, EyeInvisibleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

// --- FIREBASE IMPORTS ---
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../api/firebase';

import useDebounce from '../../hooks/useDebounce';
import TransaksiJualForm from './components/TransaksiJualForm';
import TransaksiJualDetailModal from './components/TransaksiJualDetailModal';
import TransaksiJualTableComponent from './components/TransaksiJualTableComponent';
import { generateInvoicePDF, generateNotaPDF } from '../../utils/pdfGenerator';

// IMPORT HOOK
import { useTransaksiJualStream } from '../../hooks/useFirebaseData';

import TagihanPelangganTab from './components/TagihanPelangganTab';
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';

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
 const defaultStart = useMemo(
    () => dayjs().subtract(6, 'month').startOf('day'),
    []
);
const defaultEnd = useMemo(
    () => dayjs().endOf('day'),
    []
);

const [dateRange, setDateRange] = useState([defaultStart, defaultEnd]);

    const [isAllTime, setIsAllTime] = useState(false);

    // --- STATE SENSOR NOMINAL ---
    const [showTotals, setShowTotals] = useState(false);

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

    // [OPTIMASI 1] Debounce Input
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

    // --- PDF State ---
    const [isTxPdfModalOpen, setIsTxPdfModalOpen] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [txPdfFileName, setTxPdfFileName] = useState('laporan.pdf');
    const [isTxPdfGenerating, setIsTxPdfGenerating] = useState(false);

    // --- [OPTIMASI 2] Filtering Logic dengan Concurrent Features ---
    // Gunakan useDeferredValue untuk memproses data 'berat' di background
    const deferredAllTransaksi = useDeferredValue(allTransaksi);
    const deferredDebouncedSearch = useDeferredValue(debouncedSearchText);
    const deferredSelectedStatus = useDeferredValue(selectedStatus);

    // [OPTIMASI 3] Deteksi apakah React sedang bekerja keras di background
    // Jika nilai debounced (input user) BEDA dengan deferred (hasil proses), berarti sedang loading
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
        // Gunakan variabel 'deferred...' di sini agar UI tidak freeze
        let data = [...(deferredAllTransaksi || [])];

        // Filter Status
        if (deferredSelectedStatus.length > 0) {
            data = data.filter((tx) => deferredSelectedStatus.includes(normalizeStatus(tx.statusPembayaran)));
        }

        // Filter Search (ID, Nama Customer, Keterangan)
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

    // --- Footer & Summary Calculation ---
    const footerTotals = useMemo(() => {
        const filteredData = filteredTransaksi || [];
        const totals = filteredData.reduce(
            (acc, tx) => ({
                bruto: acc.bruto + Number(tx.totalBruto || 0),
                diskon: acc.diskon + Number(tx.totalDiskon || 0),
                retur: acc.retur + Number(tx.totalRetur || 0),
                netto: acc.netto + Number(tx.totalNetto || 0),
                bayar: acc.bayar + Number(tx.totalBayar || 0)
            }), { bruto: 0, diskon: 0, retur: 0, netto: 0, bayar: 0 }
        );

        return {
            totalBruto: totals.bruto,
            totalDiskon: totals.diskon,
            totalRetur: totals.retur,
            totalTagihan: totals.netto,
            totalTerbayar: totals.bayar,
            totalSisa: totals.netto - totals.bayar,
            totalTransaksi: filteredData.length
        };
    }, [filteredTransaksi]);

    // --- TAB SUMMARY ---
    const TabSummary = useMemo(() => {
        if (screens.xs) return null;

        const renderValue = (val, style = {}) => {
            if (showTotals) {
                return <Text strong style={style}>{formatCurrency(val)}</Text>;
            }
            return <Text strong style={{ ...style, fontFamily: 'monospace', letterSpacing: '2px' }}>••••••••</Text>;
        };

        const separator = <Divider type="vertical" style={{ height: '24px', margin: '0 12px' }} />;

        return (
            <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: '8px' }}>
                <Tooltip title={showTotals ? "Sembunyikan Nominal" : "Tampilkan Nominal"}>
                    <Button
                        type="text"
                        shape="circle"
                        icon={showTotals ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                        onClick={() => setShowTotals(!showTotals)}
                    />
                </Tooltip>
                {separator}
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Total Bruto</Text>
                    {renderValue(footerTotals.totalBruto)}
                </div>
                {separator}
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Diskon</Text>
                    {renderValue(footerTotals.totalDiskon, { color: '#faad14' })}
                </div>
                {separator}
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Retur</Text>
                    {renderValue(footerTotals.totalRetur, { color: '#cf1322' })}
                </div>
                {separator}
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Total Bayar</Text>
                    {renderValue(footerTotals.totalTerbayar, { color: '#3f8600' })}
                </div>
                {separator}
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>Sisa Tagihan</Text>
                    {renderValue(footerTotals.totalSisa, { color: footerTotals.totalSisa > 0 ? '#cf1322' : '#3f8600' })}
                </div>
            </div>
        );
    }, [footerTotals, screens.xs, showTotals]);

    // --- Handlers ---
    const handleSearchChange = useCallback((e) => { setSearchText(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleDateChange = useCallback((dates) => { setIsAllTime(false); setDateRange(dates); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleToggleAllTime = useCallback((checked) => { setIsAllTime(checked); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const resetFilters = useCallback(() => { setSearchText(''); setSelectedStatus([]); setIsAllTime(false); setDateRange([defaultStart, defaultEnd]); }, [defaultStart, defaultEnd]);
    const handleTableChange = useCallback((p, f) => { setPagination(p); setSelectedStatus(f.statusPembayaran || []); }, []);

    // Modal Handlers
    const handleOpenCreate = useCallback(() => { setFormMode('create'); setEditingTx(null); setIsFormModalOpen(true); }, []);
    const handleOpenEdit = useCallback((tx) => { setFormMode('edit'); setEditingTx(tx); setIsFormModalOpen(true); }, []);
    const handleCloseFormModal = useCallback(() => { setIsFormModalOpen(false); setEditingTx(null); }, []);
    const handleFormSuccess = useCallback(() => { handleCloseFormModal(); }, [handleCloseFormModal]);
    const handleOpenDetailModal = useCallback((tx) => { setSelectedTransaksi(tx); setIsDetailModalOpen(true); }, []);
    const handleCloseDetailModal = useCallback(() => { setSelectedTransaksi(null); setIsDetailModalOpen(false); }, []);

    // --- HELPER FETCH ITEM ---
    const fetchInvoiceItems = async (invoiceId) => {
        try {
            const dbRef = ref(db, 'invoice_items');
            const q = query(dbRef, orderByChild('invoiceId'), equalTo(invoiceId));
            const snapshot = await get(q);
            if (snapshot.exists()) {
                return Object.values(snapshot.val());
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error fetching invoice items:", error);
            throw error;
        }
    };

    // --- PDF & PREVIEW HANDLERS ---
    const openPdfModal = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setTxPdfFileName(fileName);
        setIsTxPdfModalOpen(true);
        setIsTxPdfGenerating(false);
    };

    const handleCloseTxPdfModal = () => {
        setIsTxPdfModalOpen(false);
        if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl('');
        }
    };

    const handleGenerateInvoice = async (tx) => {
        message.loading({ content: 'Mengambil data item & Membuat Invoice...', key: 'pdfGen' });
        try {
            const items = await fetchInvoiceItems(tx.id);
            const fullTxData = { ...tx, items: items };
            const blob = await fetch(generateInvoicePDF(fullTxData)).then(r => r.blob());
            openPdfModal(blob, `${tx.id}.pdf`);
            message.success({ content: 'Invoice Siap', key: 'pdfGen' });
        } catch (e) {
            console.error(e);
            message.error({ content: 'Gagal membuat Invoice', key: 'pdfGen' });
        }
    };

    const handleGenerateNota = async (tx) => {
        message.loading({ content: 'Mengambil data item & Membuat Nota...', key: 'pdfGen' });
        try {
            const items = await fetchInvoiceItems(tx.id);
            const fullTxData = { ...tx, items: items };
            const blob = await fetch(generateNotaPDF(fullTxData)).then(r => r.blob());
            openPdfModal(blob, `Nota-${tx.id}.pdf`);
            message.success({ content: 'Nota Siap', key: 'pdfGen' });
        } catch (e) {
            console.error(e);
            message.error({ content: 'Gagal membuat Nota', key: 'pdfGen' });
        }
    };

    const handleGenerateReportPdf = () => {
        setIsTxPdfGenerating(true);
        setTimeout(() => {
            try {
                const doc = new jsPDF('l', 'mm', 'a4');
                const nowStr = dayjs().format('YYYYMMDD_HHmm');
                const fileName = `Laporan_Transaksi_${nowStr}.pdf`;

                doc.setFontSize(16);
                doc.text("Laporan Transaksi Penjualan", 14, 15);

                doc.setFontSize(10);
                let periodeInfo = isAllTime ? "Periode: Semua Waktu" :
                    (dateRange?.[0] ? `Periode: ${dateRange[0].format('DD MMM YYYY')} s/d ${dateRange[1].format('DD MMM YYYY')}` : "");
                doc.text(periodeInfo, 14, 22);

                const tableColumn = ["No", "Tanggal", "ID Invoice", "Customer", "Bruto", "Diskon", "Retur", "Netto", "Bayar", "Sisa", "Status"];
                const tableRows = filteredTransaksi.map((tx, index) => [
                    index + 1,
                    formatDate(tx.tanggal),
                    tx.id,
                    tx.namaCustomer,
                    formatCurrency(tx.totalBruto),
                    formatCurrency(tx.totalDiskon),
                    formatCurrency(tx.totalRetur),
                    formatCurrency(tx.totalNetto),
                    formatCurrency(tx.totalBayar),
                    formatCurrency(tx.totalNetto - tx.totalBayar),
                    normalizeStatus(tx.statusPembayaran)
                ]);

                autoTable(doc, {
                    head: [tableColumn],
                    body: tableRows,
                    startY: 30,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [22, 119, 255] },
                    columnStyles: {
                        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
                        7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }
                    }
                });

                const finalY = doc.lastAutoTable.finalY + 10;
                doc.setFontSize(10);
                doc.setFont("helvetica", "bold");

                doc.text(`Total Transaksi: ${filteredTransaksi.length}`, 14, finalY);
                doc.text(`Total Bruto: ${formatCurrency(footerTotals.totalBruto)}`, 14, finalY + 5);
                doc.text(`Total Diskon: ${formatCurrency(footerTotals.totalDiskon)}`, 14, finalY + 10);
                doc.text(`Total Retur: ${formatCurrency(footerTotals.totalRetur)}`, 14, finalY + 15);

                doc.text(`Total Netto (Tagihan): ${formatCurrency(footerTotals.totalTagihan)}`, 150, finalY + 5);
                doc.text(`Total Bayar: ${formatCurrency(footerTotals.totalTerbayar)}`, 150, finalY + 10);
                doc.text(`Total Sisa: ${formatCurrency(footerTotals.totalSisa)}`, 150, finalY + 15);

                const pdfBlob = doc.output('blob');
                openPdfModal(pdfBlob, fileName);

            } catch (error) {
                console.error("Gagal membuat PDF:", error);
                message.error("Gagal membuat laporan PDF");
                setIsTxPdfGenerating(false);
            }
        }, 100);
    };

    const renderAksi = useCallback((_, record) => {
        const items = [
            { key: "detail", label: "Lihat Detail", onClick: () => handleOpenDetailModal(record) },
            { key: "edit", label: "Edit Transaksi", onClick: () => handleOpenEdit(record) },
            { type: "divider" },
            { key: "inv", label: "Generate Invoice", onClick: () => handleGenerateInvoice(record) },
            {
                key: "nota",
                label: "Generate Nota",
                onClick: () => handleGenerateNota(record)
            },
        ];
        return <Dropdown menu={{ items }} trigger={["click"]}><Button icon={<MoreOutlined />} size="small" /></Dropdown>;
    }, [handleOpenDetailModal, handleOpenEdit]);

    const columns = useMemo(() => [
        { title: 'No.', width: 50, fixed: 'left', render: (_t, _r, idx) => ((pagination.current - 1) * pagination.pageSize) + idx + 1 },
        { title: 'Tanggal', dataIndex: 'tanggal', width: 100, render: formatDate, sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0) },
        { title: 'ID', dataIndex: 'id', width: 140, render: (id) => <Text copyable={{ text: id }}>{id}</Text>, sorter: (a, b) => (a.id || '').localeCompare(b.id || '') },
        { title: 'Customer', dataIndex: 'namaCustomer', width: 180, sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || '') },
        { title: 'Bruto', dataIndex: 'totalBruto', align: 'right', width: 120, render: formatCurrency, sorter: (a, b) => (a.totalBruto || 0) - (b.totalBruto || 0) },
        { title: 'Dsc', dataIndex: 'totalDiskon', align: 'right', width: 90, render: (val) => <span style={{ color: '#faad14' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span>, sorter: (a, b) => (a.totalDiskon || 0) - (b.totalDiskon || 0) },
        { title: 'Retur', dataIndex: 'totalRetur', align: 'right', width: 90, render: (val) => <span style={{ color: '#cf1322' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span>, sorter: (a, b) => (a.totalRetur || 0) - (b.totalRetur || 0) },
        { title: 'Netto', dataIndex: 'totalNetto', align: 'right', width: 120, render: (val) => <Text strong>{formatCurrency(val)}</Text>, sorter: (a, b) => (a.totalNetto || 0) - (b.totalNetto || 0) },
        { title: 'Bayar', dataIndex: 'totalBayar', align: 'right', width: 120, render: (val) => <span style={{ color: '#3f8600' }}>{formatCurrency(val)}</span>, sorter: (a, b) => (a.totalBayar || 0) - (b.totalBayar || 0) },
        { title: 'Sisa', key: 'sisa', align: 'right', width: 120, sorter: (a, b) => { const sisaA = (a.totalNetto || 0) - (a.totalBayar || 0); const sisaB = (b.totalNetto || 0) - (b.totalBayar || 0); return sisaA - sisaB; }, render: (_, r) => { const sisa = (r.totalNetto || 0) - (r.totalBayar || 0); return <span style={{ color: sisa > 0 ? '#cf1322' : '#3f8600', fontWeight: sisa > 0 ? 'bold' : 'normal' }}>{formatCurrency(sisa)}</span>; } },
        { title: 'Status', dataIndex: 'statusPembayaran', width: 100, fixed: 'right', filters: [{ text: 'BELUM', value: 'BELUM' }, { text: 'LUNAS', value: 'LUNAS' }, ,], filteredValue: selectedStatus.length ? selectedStatus : null, render: (s) => <Tag color={normalizeStatus(s) === 'LUNAS' ? 'green' : normalizeStatus(s) === 'BELUM' ? 'red' : 'orange'}>{normalizeStatus(s)}</Tag> },
        { title: 'Aksi', align: 'center', width: 60, fixed: 'right', render: renderAksi },
    ], [pagination, renderAksi, selectedStatus]);

    const tableScrollX = 1500;

    // [OPTIMASI 4] Gabungkan logic loading
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
                                    <Button
                                        icon={<PrinterOutlined />}
                                        onClick={handleGenerateReportPdf}
                                        disabled={!filteredTransaksi.length}
                                        loading={isTxPdfGenerating}
                                    >
                                        Laporan PDF
                                    </Button>
                                    <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>Tambah</Button>
                                </div>
                            </div>
                        </Col>
                    </Row>

                    {/* [OPTIMASI 5] Gunakan isLoading gabungan pada Spin */}
                    <Spin spinning={isLoading} tip={isAllTime ? "Mengunduh & Memproses SEMUA data..." : "Memproses data..."} size="large" style={{ minHeight: 200 }}>
                        <TransaksiJualTableComponent columns={columns} dataSource={filteredTransaksi} loading={false} pagination={pagination} handleTableChange={handleTableChange} tableScrollX={tableScrollX} rowClassName={(r, i) => (i % 2 === 0 ? 'table-row-even' : 'table-row-odd')} />
                    </Spin>
                </Card>
            )
        },
        {
            key: '2',
            label: <Space><PullRequestOutlined /> Tagihan Customer</Space>,
            children: <TagihanPelangganTab allTransaksi={allTransaksi} loadingTransaksi={loadingTransaksi} dateRange={dateRange} isAllTime={isAllTime} />
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

                <PdfPreviewModal
                    visible={isTxPdfModalOpen}
                    onClose={handleCloseTxPdfModal}
                    pdfBlobUrl={pdfPreviewUrl}
                    fileName={txPdfFileName}
                />
            </Content>
        </Layout>
    );
}