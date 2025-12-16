import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, Tag
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
// Ganti hook ini sesuai hook Anda untuk mengambil list "returns"
import { useReturStream, globalRetur } from '../../hooks/useFirebaseData'; 
import useDebounce from '../../hooks/useDebounce';
import { generateNotaReturPDF } from '../../utils/notaretur';

// COMPONENTS
// Ganti sesuai form Retur Anda
import ReturForm from './components/ReturForm'; 
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';
import { DatePicker } from 'antd';

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#fff1f0', minHeight: '100vh' }, // Warna background agak merah utk Retur
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#cc6804ff' },
};

const ReturPage = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState(() => {
        // Gunakan global state jika ada, atau default tahun ini
        if (globalRetur?.lastDateRange) {
            return globalRetur.lastDateRange;
        }
        return [dayjs().startOf('year'), dayjs().endOf('day')];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null); // Loading print
    
    // --- DATA FETCHING (HEADER ONLY) ---
    // Mengambil data dari node 'returns'
    const { returList = [], loadingRetur = true } = useReturStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRetur, setEditingRetur] = useState(null);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- HOOKS ---
    const debouncedSearchText = useDebounce(searchText, 300);
    const deferredSearch = useDeferredValue(debouncedSearchText);
    const isSearching = searchText !== debouncedSearchText;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
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

    // --- PRINT HANDLER (FETCH DETAIL RETUR) ---
    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id); // Loading Start
        
        try {
            const returItems = [];

            // 1. Ref ke 'return_items'
            const itemsRef = ref(db, 'return_items');
            
            // 2. Query cari item yang 'returnId' == record.id
            const q = query(itemsRef, orderByChild('returnId'), equalTo(record.id));
            
            // 3. Fetch Data
            const snapshot = await get(q);

            // 4. Parse Data
            if (snapshot.exists()) {
                snapshot.forEach((childSnapshot) => {
                    returItems.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
            }

            // 5. Generate PDF (Header + Items)
            const pdfData = generateNotaReturPDF(record, returItems);
            
            // 6. Preview
            setPdfPreviewUrl(pdfData);
            setPdfFileName(`Retur_${record.id}.pdf`);
            setIsPreviewModalVisible(true);

        } catch (error) {
            console.error("Gagal generate PDF Retur:", error);
            message.error("Gagal mengambil detail retur.");
        } finally {
            setPrintingId(null); // Loading Stop
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
                            // Icon Loading
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
                            suffix={isSearching ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" danger icon={<PlusOutlined />} onClick={handleTambah}>
                            Retur Baru
                        </Button>
                    </Col>
                </Row>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loadingRetur}
                    rowKey="id"
                    size="middle"
                    scroll={{ x: 1200 }}
                    pagination={{
                        defaultPageSize: 10,
                        showTotal: (total) => `Total ${total} Data`,
                        showSizeChanger: true
                    }}
                />
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