import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, Tag, Spin
} from 'antd';
import {
    PlusOutlined, EditOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// --- FIREBASE IMPORTS (Realtime Database) ---
import { db } from '../../api/firebase'; 
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';

// UTILS & HOOKS
import { currencyFormatter } from '../../utils/formatters';
import { useReturStream, globalRetur } from '../../hooks/useFirebaseData'; 
import useDebounce from '../../hooks/useDebounce';
import { generateNotaReturPDF } from '../../utils/notaretur';

// COMPONENTS
import ReturForm from './components/ReturForm'; 
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';
import { DatePicker } from 'antd';

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#fff1f0', minHeight: '100vh' }, 
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#cc6804ff' },
};

const ReturPage = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState(() => {
        if (globalRetur?.lastDateRange) {
            return globalRetur.lastDateRange;
        }
return [
    dayjs().subtract(6, 'month').startOf('day'),
    dayjs().endOf('day'),
];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null); 
    
    // --- DATA FETCHING (HEADER ONLY) ---
    const { returList = [], loadingRetur = true } = useReturStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRetur, setEditingRetur] = useState(null);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- [OPTIMASI 1] HOOKS & DEBOUNCE ---
    // Ubah debounce ke 800ms agar lebih ringan
    const debouncedSearchText = useDebounce(searchText, 800);
    
    // [OPTIMASI 2] Deferred Value
    // React akan memproses filtering di background (low priority)
    const deferredSearch = useDeferredValue(debouncedSearchText);
    
    // [OPTIMASI 3] Deteksi Background Processing
    // Jika input user (debounced) beda dengan hasil proses (deferred), berarti sedang loading
    const isProcessing = debouncedSearchText !== deferredSearch;

    // Gabungkan status loading (Fetch Data + Filter Data)
    const isLoading = loadingRetur || isProcessing;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
        // Gunakan deferredSearch agar UI tidak freeze
        let data = [...(returList || [])];

        if (deferredSearch) {
            const q = deferredSearch.toLowerCase();
            data = data.filter(tx =>
                (tx.id || '').toLowerCase().includes(q) ||
                (tx.namaCustomer || '').toLowerCase().includes(q) ||
                (tx.invoiceId || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q)
            );
        }

        // Sort: Tanggal Terbaru
        data.sort((a, b) => b.tanggal - a.tanggal);
        return data;
    }, [returList, deferredSearch]);

    // --- HANDLERS ---
    const handleTambah = () => { setEditingRetur(null); setIsModalOpen(true); };
    const handleEdit = (record) => { setEditingRetur({ ...record }); setIsModalOpen(true); };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setEditingRetur(null), 300);
    };

    // --- PRINT HANDLER ---
    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id); 
        
        try {
            const returItems = [];
            const itemsRef = ref(db, 'return_items');
            const q = query(itemsRef, orderByChild('returnId'), equalTo(record.id));
            const snapshot = await get(q);

            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    returItems.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
            }

            const pdfData = generateNotaReturPDF(record, returItems);
            setPdfPreviewUrl(pdfData);
            setPdfFileName(`Retur_${record.id}.pdf`);
            setIsPreviewModalVisible(true);

        } catch (error) {
            console.error("Gagal generate PDF Retur:", error);
            message.error("Gagal mengambil detail retur.");
        } finally {
            setPrintingId(null); 
        }
    };

    const handleClosePreviewModal = () => {
        setIsPreviewModalVisible(false);
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl('');
    };

    // --- TABLE COLUMNS ---
    const columns = [
        {
            title: "Tanggal",
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 130,
            fixed: 'left',
            render: (val) => dayjs(val).format('DD MMM YYYY'),
            sorter: (a, b) => a.tanggal - b.tanggal,
            defaultSortOrder: 'descend',
        },
        {
            title: "ID Retur",
            dataIndex: 'id',
            key: 'id',
            width: 150,
            render: (text) => <Text copyable style={{ fontSize: 12 }}>{text}</Text>,
            sorter: (a, b) => (a.id || '').localeCompare(b.id || ''),
        },
        {
            title: "Ref Invoice",
            dataIndex: 'invoiceId',
            key: 'invoiceId',
            width: 150,
            render: (text) => <Text type="secondary" style={{ fontSize: 12 }}>{text || '-'}</Text>,
        },
        {
            title: "Nama Customer",
            dataIndex: 'namaCustomer',
            key: 'namaCustomer',
            width: 250,
            render: (text) => (
                <div style={{ lineHeight: '1.2' }}>
                    <Text strong>{text || 'Umum'}</Text>
                </div>
            ),
            sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || ''),
        },
        {
            title: "Keterangan",
            dataIndex: 'keterangan',
            key: 'keterangan',
            render: (text) => <Text type="secondary" style={{ fontSize: 13 }}>{text || '-'}</Text>,
        },
        {
            title: "Total Retur",
            dataIndex: 'totalRetur',
            key: 'totalRetur',
            align: 'right',
            width: 160,
            render: (val) => <Text strong style={{ color: '#cf1322' }}>{currencyFormatter(val)}</Text>,
            sorter: (a, b) => (a.totalRetur || 0) - (b.totalRetur || 0),
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 100,
            fixed: 'right',
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="Cetak Nota Retur">
                        <Button
                            size="small"
                            type="text"
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handlePrintTransaction(r)}
                            disabled={printingId !== null} 
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
                    </Tooltip>
                </Space>
            )
        },
    ];

    return (
        <Content style={styles.pageContainer}>
            <Card style={styles.card}>
                <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 20 }}>
                    <Col xs={24} md={8}>
                        <Text style={styles.headerTitle}>Daftar Retur Penjualan</Text>
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <RangePicker
                            style={{ width: 240 }}
                            onChange={(d) => d && setDateRange(d)}
                            value={dateRange}
                            format="DD MMM YYYY"
                            allowClear={false}
                        />
                        <Input
                            placeholder="Cari Customer, ID, Invoice..."
                            // Visual feedback untuk debounce
                            suffix={searchText !== debouncedSearchText ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" danger icon={<PlusOutlined />} onClick={handleTambah}>
                           Input Retur
                        </Button>
                    </Col>
                </Row>

                {/* [OPTIMASI 4] Bungkus Table dengan Spin & isLoading gabungan */}
                <Spin spinning={isLoading} tip="Memproses data retur..." size="large" style={{ minHeight: 200 }}>
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        // Loading bawaan Table dimatikan
                        loading={false} 
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 1200 }}
                        pagination={{
                            defaultPageSize: 10,
                            showTotal: (total) => `Total ${total} Data`,
                            showSizeChanger: true
                        }}
                    />
                </Spin>
            </Card>

            {isModalOpen && (
                <ReturForm
                    key={editingRetur ? editingRetur.id : 'create-new'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    initialValues={editingRetur}
                />
            )}

            <PdfPreviewModal
                visible={isPreviewModalVisible}
                onClose={handleClosePreviewModal}
                pdfBlobUrl={pdfPreviewUrl}
                fileName={pdfFileName}
            />
        </Content>
    );
};

export default ReturPage;