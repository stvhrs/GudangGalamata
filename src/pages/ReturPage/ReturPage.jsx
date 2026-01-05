import React, { useState, useMemo, useCallback, useDeferredValue, useTransition } from 'react';
import {
    Layout, Card, Spin, Input, Row, Col, Button,
    Space, App, DatePicker, Typography, Table, Tooltip
} from 'antd';
import {
    PlusOutlined, PrinterOutlined,
    SearchOutlined, CloseCircleOutlined, LoadingOutlined, EditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// --- FIREBASE IMPORTS ---
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '../../api/firebase';

import useDebounce from '../../hooks/useDebounce';
import ReturForm from './components/ReturForm';

// IMPORT HELPER RAW TEXT RETUR
import { generateReturText } from '../../utils/printReturText';

// IMPORT WIDGET PREVIEW
import RawTextPreviewModal from '../../components/RawTextPreviewModal';

// IMPORT HOOK
import { useReturStream, globalRetur } from '../../hooks/useFirebaseData';

const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- Helpers ---
const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
const formatDate = (timestamp) => new Date(timestamp || 0).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ReturPage() {
    const { message } = App.useApp();
    const [isPending, startTransition] = useTransition();

    // --- STATE CONFIG ---
    const defaultStart = useMemo(() => dayjs().subtract(6, 'month').startOf('day'), []);
    const defaultEnd = useMemo(() => dayjs().endOf('day'), []);

    const [dateRange, setDateRange] = useState(() => {
        if (globalRetur?.lastDateRange) return globalRetur.lastDateRange;
        return [defaultStart, defaultEnd];
    });

    // --- DATA FETCHING ---
    const { returList = [], loadingRetur } = useReturStream(dateRange);

    // --- State UI ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [printingId, setPrintingId] = useState(null); // State untuk loading tombol print

    const [pagination, setPagination] = useState({
        current: 1, pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", '25', '50', '100'], 
        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} retur`
    });

    // --- Modals ---
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingRetur, setEditingRetur] = useState(null);

    // --- RAW TEXT PREVIEW STATE (RawTextPreviewModal) ---
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);

    // --- CONCURRENT UI OPTIMIZATION ---
    const deferredReturList = useDeferredValue(returList);
    const deferredDebouncedSearch = useDeferredValue(debouncedSearchText);
    const isProcessing = (debouncedSearchText !== deferredDebouncedSearch);

    const filteredData = useMemo(() => {
        let data = [...(deferredReturList || [])];

        if (deferredDebouncedSearch) {
            const q = deferredDebouncedSearch.toLowerCase();
            data = data.filter((item) =>
                (item.id || '').toLowerCase().includes(q) ||
                (item.namaCustomer || '').toLowerCase().includes(q) ||
                (item.invoiceId || '').toLowerCase().includes(q) ||
                (item.keterangan || '').toLowerCase().includes(q)
            );
        }
        // Sort Terbaru
        return data.sort((a, b) => (b.tanggal || 0) - (a.tanggal || 0));
    }, [deferredReturList, deferredDebouncedSearch]);

    // --- Handlers ---
    const handleSearchChange = useCallback((e) => { setSearchText(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleDateChange = useCallback((dates) => { 
        if(dates) setDateRange(dates); 
        setPagination(prev => ({ ...prev, current: 1 })); 
    }, []);
    
    const resetFilters = useCallback(() => { setSearchText(''); setDateRange([defaultStart, defaultEnd]); }, [defaultStart, defaultEnd]);

    const handleOpenCreate = () => { setEditingRetur(null); setIsFormModalOpen(true); };
    const handleOpenEdit = (record) => { setEditingRetur(record); setIsFormModalOpen(true); };
    const handleCloseFormModal = () => { setIsFormModalOpen(false); setTimeout(() => setEditingRetur(null), 300); };

    // --- FETCH ITEM HELPER (On Demand) ---
    const fetchReturItems = async (returId) => {
        try {
            const dbRef = ref(db, 'return_items');
            const q = query(dbRef, orderByChild('returnId'), equalTo(returId));
            const snapshot = await get(q);
            if (snapshot.exists()) {
                const raw = snapshot.val();
                return Object.keys(raw).map(key => ({
                    id: key,
                    ...raw[key]
                }));
            }
            return [];
        } catch (error) {
            console.error("Error fetching retur items:", error);
            message.error("Gagal mengambil detail item retur.");
            return [];
        }
    };

    // --- RAW TEXT GENERATION & PRINT ---
    const handleShowPreview = async (record) => {
        setPrintingId(record.id); 
        setLoadingPreview(true);
        
        try {
            // Ambil item dulu dari firebase
            const items = await fetchReturItems(record.id);
            // Generate Text
            const rawText = generateReturText(record, items);
            
            setPreviewContent(rawText);
            setIsPreviewOpen(true);
        } catch (e) {
            console.error(e);
            message.error("Gagal generate nota: " + e.message);
        } finally {
            setPrintingId(null);
            setLoadingPreview(false);
        }
    };

    const handlePrintFromPreview = () => {
        if (!previewContent) return;
        const printWindow = window.open('', '', 'width=950,height=600');
        const style = `
            <style>
                @page { size: 9.5in 5.5in; margin: 0; }
                html, body { margin: 0; padding: 0; width: 9.5in; height: 5.5in; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 13px;
                    line-height: 1.15;
                    padding-top: 0.1in;
                    padding-left: 0.1in;
                    white-space: pre; 
                }
                @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
        `;
        printWindow.document.write('<html><head><title>Print Retur</title>' + style + '</head><body>');
        printWindow.document.write(previewContent);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    };

    // --- COLUMNS (ICON LANGSUNG) ---
    const renderAksi = useCallback((_, record) => {
        return (
            <Space>
                <Tooltip title="Cetak Nota">
                    <Button 
                        size="small" 
                        type="text" 
                        icon={printingId === record.id ? <LoadingOutlined /> : <PrinterOutlined />} 
                        onClick={() => handleShowPreview(record)}
                        disabled={printingId !== null && printingId !== record.id}
                    />
                </Tooltip>
                <Tooltip title="Edit Retur">
                    <Button 
                        size="small" 
                        type="text" 
                        icon={<EditOutlined />} 
                        onClick={() => handleOpenEdit(record)} 
                    />
                </Tooltip>
            </Space>
        );
    }, [printingId]); 

    const columns = useMemo(() => [
        { title: 'No.', width: 50, fixed: 'left', render: (_t, _r, idx) => ((pagination.current - 1) * pagination.pageSize) + idx + 1 },
        { title: 'Tanggal', dataIndex: 'tanggal', width: 110, render: formatDate, sorter: (a, b) => (a.tanggal || 0) - (b.tanggal || 0) },
        { title: 'ID Retur', dataIndex: 'id', width: 140, render: (id) => <Text copyable={{ text: id }}>{id}</Text> },
        { title: 'Ref Invoice', dataIndex: 'invoiceId', width: 140, render: (t) => <Text type="secondary">{t || '-'}</Text> },
        { title: 'Customer', dataIndex: 'namaCustomer', width: 200, sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || '') },
        { title: 'Keterangan', dataIndex: 'keterangan', render: (t) => <Text type="secondary" style={{fontSize: 12}}>{t ? (t.length > 30 ? t.substring(0,30)+'...' : t) : '-'}</Text> },
        { title: 'Total Retur', dataIndex: 'totalRetur', align: 'right', width: 150, render: (val) => <Text strong style={{ color: '#cf1322' }}>{formatCurrency(val)}</Text>, sorter: (a, b) => (a.totalRetur || 0) - (b.totalRetur || 0) },
        { title: 'Aksi', align: 'center', width: 100, fixed: 'right', render: renderAksi },
    ], [pagination, renderAksi]);

    const isLoading = loadingRetur || isPending || isProcessing;

    return (
        <Content style={{ padding: '24px', backgroundColor: '#fff1f0', minHeight: '100vh' }}>
            <Card bodyStyle={{ padding: '24px' }}>
                <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 24 }}>
                    <Col xs={24} md={8}>
                        <Text strong style={{ fontSize: 16, color: '#cf1322' }}>Daftar Retur Penjualan</Text>
                    </Col>
                    <Col xs={24} md={16}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                             {searchText && <Button icon={<CloseCircleOutlined />} danger type="text" size="small" onClick={resetFilters}>Reset</Button>}
                            
                            <RangePicker format="D MMM YYYY" value={dateRange} onChange={handleDateChange} allowClear={false} style={{ width: 240 }} />
                            
                            <Input 
                                placeholder="Cari ID / Customer..." 
                                prefix={searchText !== debouncedSearchText ? <LoadingOutlined /> : <SearchOutlined style={{ color: '#bfbfbf' }} />} 
                                value={searchText} 
                                onChange={handleSearchChange} 
                                allowClear 
                                style={{ width: 200 }} 
                            />
                            
                            <Button type="primary" danger icon={<PlusOutlined />} onClick={handleOpenCreate}>Input Retur</Button>
                        </div>
                    </Col>
                </Row>

                <Spin spinning={isLoading} tip="Memproses data retur..." size="large" style={{ minHeight: 200 }}>
                    <Table 
                        columns={columns}
                        dataSource={filteredData}
                        loading={false}
                        rowKey="id"
                        pagination={pagination}
                        onChange={(p) => setPagination(p)}
                        scroll={{ x: 1200 }}
                        size="middle"
                    />
                </Spin>
            </Card>

            {isFormModalOpen && (
                <ReturForm 
                    key={editingRetur ? editingRetur.id : 'create'} 
                    open={isFormModalOpen} 
                    onCancel={handleCloseFormModal} 
                    initialValues={editingRetur} 
                />
            )}

            {/* --- MODAL PREVIEW RAW TEXT (Reusable Widget) --- */}
            <RawTextPreviewModal
                visible={isPreviewOpen}
                onCancel={() => setIsPreviewOpen(false)}
                content={previewContent}
                loading={loadingPreview}
                title="Preview Nota Retur"
                onPrint={handlePrintFromPreview}
            />
        </Content>
    );
}