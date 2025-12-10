import React, { useState, useMemo } from 'react';
import { Card, Table, Input, Row, Col, Typography, DatePicker, Statistic, Button, Space, Spin, Popconfirm, message, Modal, Form, Tag } from 'antd';
import { ReloadOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined, ArrowUpOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// --- CUSTOM HOOKS ---
import { useHistoriStokStream } from '../../../hooks/useFirebaseData'; 
import useDebounce from '../../../hooks/useDebounce'; 
import { timestampFormatter, numberFormatter } from '../../../utils/formatters';

// --- IMPORT FIREBASE ---
import { getDatabase, ref, update, runTransaction, remove } from 'firebase/database';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ============================================================================
// --- SERVICE LOGIC ---
// ============================================================================

const serviceDeleteTransaction = async (record) => {
    const db = getDatabase();
    const bookKey = record.kode_buku; 
    
    if (!bookKey) throw new Error("Kode Buku tidak ditemukan.");

    console.log(`[DELETE] History: ${record.id} | Revert Stok Buku: ${bookKey}`);

    const historyRef = ref(db, `historiStok/${record.id}`);
    const bookStockRef = ref(db, `buku/${bookKey}/stok`);

    // Kembalikan stok (Revert): Stok Sekarang - Jumlah History
    await runTransaction(bookStockRef, (currentStock) => {
        const current = Number(currentStock) || 0;
        const revertAmount = Number(record.perubahan);
        return current - revertAmount;
    });

    // Hapus data history
    await remove(historyRef);
    return true;
};

const serviceUpdateTransaction = async (idHistory, kodeBuku, oldQty, newQty, stokSebelum, newKeterangan) => {
    const db = getDatabase();
    
    if (!kodeBuku) throw new Error("Kode Buku tidak valid.");

    // 1. Hitung Selisih Real (Berapa yang harus ditambah/dikurang ke buku)
    const selisih = Number(newQty) - Number(oldQty);

    // 2. Hitung Ulang Stok Sesudah di History
    const newStokSesudah = Number(stokSebelum || 0) + Number(newQty);

    console.log(`[EDIT] Delta Real: ${selisih} | History StokSesudah: ${newStokSesudah}`);

    const updates = {};
    updates[`historiStok/${idHistory}/perubahan`] = Number(newQty);
    updates[`historiStok/${idHistory}/stokSesudah`] = Number(newStokSesudah);
    updates[`historiStok/${idHistory}/keterangan`] = newKeterangan;

    // Update Stok Real Buku
    const bookStockRef = ref(db, `buku/${kodeBuku}/stok`);
    await runTransaction(bookStockRef, (currentStock) => {
        const current = Number(currentStock) || 0;
        return current + selisih;
    });

    // Update History
    await update(ref(db), updates);

    return true;
};

// ============================================================================
// --- MAIN COMPONENT ---
// ============================================================================

const StokHistoryTabRestock = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState([
        dayjs().subtract(1, 'month').startOf('month'), 
        dayjs().endOf('month')
    ]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [loadingAction, setLoadingAction] = useState(false);
    const [form] = Form.useForm();

    // --- DATA STREAM ---
    const streamParams = useMemo(() => ({
        startDate: dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : null,
        endDate: dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : null
    }), [dateRange]);

    const { historyList, loadingHistory } = useHistoriStokStream(streamParams);
    
    // --- FILTER ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);

    const filteredHistory = useMemo(() => {
        if (!historyList) return [];
        let data = [...historyList];

        // 1. FILTER RESTOCK: Hanya ambil yang depannya "Restock"
        data = data.filter(item => {
            const ket = item.keterangan || '';
            return ket.startsWith('Restock');
        });

        // 2. FILTER SEARCH
        if (debouncedSearchText) {
            const lowerSearch = debouncedSearchText.toLowerCase();
            data = data.filter(item =>
                (item.judul || '').toLowerCase().includes(lowerSearch) ||
                (item.kode_buku || '').toLowerCase().includes(lowerSearch)
            );
        }
        return data;
    }, [historyList, debouncedSearchText]);

    // --- HANDLERS ---
    const handleRefresh = () => {
        const current = [...dateRange];
        setDateRange([]); 
        setTimeout(() => setDateRange(current), 100);
    };

    const handleDelete = async (record) => {
        setLoadingAction(true);
        try {
            await serviceDeleteTransaction(record);
            message.success("Data dihapus & stok dikembalikan.");
        } catch (error) {
            console.error(error);
            message.error(`Gagal delete: ${error.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    const handleEditClick = (record) => {
        setEditingItem(record);
        form.setFieldsValue({
            judul: record.judul,
            perubahan: record.perubahan, 
            keterangan: record.keterangan 
        });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        try {
            const values = await form.validateFields();
            setLoadingAction(true);

            const oldQty = Number(editingItem.perubahan);
            const newQty = Number(values.perubahan);
            const stokSebelum = Number(editingItem.stokSebelum) || 0; 
            const kodeBuku = editingItem.kode_buku; 

            // --- LOGIKA IDENTIFIER ---
            // Pastikan kata "Restock" tetap ada di depan agar tidak hilang dari filter.
            let userText = values.keterangan;
            
            // Cek case-insensitive (restock, Restock, RESTOCK)
            if (!userText.toLowerCase().startsWith('restock')) {
                userText = `Restock ${userText}`; // Tambahkan manual jika user menghapusnya
            }

            await serviceUpdateTransaction(
                editingItem.id,
                kodeBuku, 
                oldQty,
                newQty,
                stokSebelum, 
                userText
            );

            message.success("Update Berhasil!");
            setIsEditModalOpen(false);
            
        } catch (error) {
            console.error(error);
            message.error(`Gagal update: ${error.message}`);
        } finally {
            setLoadingAction(false);
        }
    };

    // --- COLUMNS ---
    const columns = [
        {
            title: 'Waktu', dataIndex: 'timestamp', key: 'timestamp',
            render: timestampFormatter, width: 150, fixed: 'left',
            sorter: (a, b) => a.timestamp - b.timestamp
        },
        { title: 'Judul Buku', dataIndex: 'judul', key: 'judul', width: 250, fixed: 'left' },
        { title: 'Kode', dataIndex: 'kode_buku', key: 'kode_buku', width: 120 },
        { 
            title: 'Masuk', dataIndex: 'perubahan', key: 'perubahan',
            align: 'right', width: 100,
            render: (val) => <Tag color="green">+{numberFormatter(val)}</Tag>
        },
        { 
            title: 'Awal', dataIndex: 'stokSebelum', key: 'stokSebelum', 
            align: 'right', width: 90, render: numberFormatter 
        },
        { 
            title: 'Akhir', dataIndex: 'stokSesudah', key: 'stokSesudah', 
            align: 'right', width: 90, render: (val) => <Text strong>{numberFormatter(val)}</Text>
        },
        { 
            title: 'Keterangan', dataIndex: 'keterangan', key: 'keterangan', width: 250,
            // Tidak ada lagi logika warna abu-abu (clean)
        },
        {
            title: 'Aksi', key: 'aksi', width: 100, fixed: 'right', align: 'center',
            render: (_, record) => (
                <Space>
                    <Button 
                        icon={<EditOutlined />} 
                        size="small" 
                        onClick={() => handleEditClick(record)} 
                    />
                    <Popconfirm
                        title="Hapus Data?"
                        description={`Stok buku akan dikurangi ${record.perubahan} pcs.`}
                        onConfirm={() => handleDelete(record)}
                        okText="Hapus"
                        cancelText="Batal"
                        okButtonProps={{ loading: loadingAction, danger: true }}
                    >
                        <Button 
                            icon={<DeleteOutlined />} 
                            size="small" 
                            danger 
                            loading={loadingAction}
                        />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // --- RENDER ---
    return (
        <Spin spinning={loadingHistory} tip="Sync Data...">
            <Card style={{ marginBottom: 16 }}>
                 <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
                    <Col>
                         <Title level={4} style={{ margin: 0 }}>Restock History</Title>
                    </Col>
                    <Col>
                         <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Sync</Button>
                    </Col>
                </Row>
                
                <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                    <Statistic 
                        title="Total Barang Masuk"
                        value={filteredHistory.reduce((acc, curr) => acc + (Number(curr.perubahan) || 0), 0)}
                        prefix="+"
                        valueStyle={{ color: '#3f8600' }}
                        formatter={numberFormatter}
                    />
                </Card>
            </Card>

            <Card>
                <Row justify="end" style={{ marginBottom: 16 }} gutter={[8,8]}>
                    <Col>
                        <RangePicker 
                            value={dateRange}
                            onChange={(dates) => setDateRange(dates)}
                            allowClear={false}
                            format="DD MMM YYYY"
                        />
                    </Col>
                    <Col>
                         <Input.Search
                            placeholder="Cari..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                            style={{ width: 200 }}
                        />
                    </Col>
                </Row>

                <Table
                    columns={columns}
                    dataSource={filteredHistory}
                    loading={loadingHistory}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1000, y: 500 }}
                    pagination={{ defaultPageSize: 20 }}
                />
            </Card>

            <Modal
                title={<span><EditOutlined /> Edit Restock</span>}
                open={isEditModalOpen}
                onOk={handleSaveEdit}
                onCancel={() => setIsEditModalOpen(false)}
                confirmLoading={loadingAction}
                okText="Simpan"
                okButtonProps={{ danger: true }}
            >
                <div style={{ marginBottom: 16, padding: 10, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                    <Text type="danger">
                        <ExclamationCircleOutlined /> <b>Perhatian:</b> 
                        <br/>1. Stok Real Buku akan diupdate otomatis.
                        <br/>2. Kata "Restock" wajib ada di depan (sistem akan menambahkannya jika Anda hapus).
                    </Text>
                </div>

                <Form form={form} layout="vertical">
                    <Form.Item label="Judul Buku">
                        <Input disabled value={editingItem?.judul} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                             <Form.Item label="Qty Lama"><Input disabled value={editingItem?.perubahan} /></Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="perubahan" label="Qty Baru" rules={[{ required: true }]}>
                                <Input type="number" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item 
                        name="keterangan" 
                        label="Keterangan" 
                        rules={[{ required: true }]} 
                    >
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </Spin>
    );
};

export default StokHistoryTabRestock;