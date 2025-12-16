import React, { useState, useMemo, useCallback } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, message, Popconfirm, Tooltip
} from 'antd';
import { DeleteOutlined, HistoryOutlined, UserAddOutlined } from '@ant-design/icons';
import { ref, remove } from 'firebase/database';
import { db } from '../../api/firebase';

import { usePelangganStream } from '../../hooks/useFirebaseData';
import useDebounce from '../../hooks/useDebounce';
import PelangganForm from './components/PelangganForm';
import CustomerHistoryModal from './components/CustomerHistoryModal';

const { Content } = Layout;
const { Search } = Input;

export default function PelangganPage() {
    const { pelangganList, loadingPelanggan } = usePelangganStream();

    // --- SETUP SEARCH & PAGINATION ---
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 500);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPelanggan, setEditingPelanggan] = useState(null);
    
    // State Modal History
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);

    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 25,
        showSizeChanger: true,
        pageSizeOptions: ['25', '50', '100', '200'],
        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} pelanggan`
    });

    // --- FILTERING ---
    const filteredPelanggan = useMemo(() => {
        let data = pelangganList || [];
        if (debouncedSearchText) {
            const query = debouncedSearchText.toLowerCase();
            data = data.filter(p =>
                (p.nama && p.nama.toLowerCase().includes(query)) ||
                (p.telepon && p.telepon.includes(query))
            );
        }
        return data;
    }, [pelangganList, debouncedSearchText]);

    // --- HANDLERS ---
    const handleSearchChange = useCallback((e) => {
        setSearchText(e.target.value);
        if (pagination.current !== 1) setPagination(prev => ({ ...prev, current: 1 }));
    }, [pagination.current]);

    const handleTableChange = useCallback((paginationConfig) => {
        setPagination(paginationConfig);
    }, []);

    const handleOpenCreate = useCallback(() => {
        setEditingPelanggan(null);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setTimeout(() => setEditingPelanggan(null), 300);
    }, []);

    const handleFormSuccess = useCallback(() => {
        handleCloseModal();
    }, [handleCloseModal]);

    const handleDelete = useCallback(async (idPelanggan) => {
        if (!idPelanggan) return;
        message.loading({ content: 'Menghapus pelanggan...', key: 'del_pel' });
        try {
            await remove(ref(db, `customers/${idPelanggan}`));
            message.success({ content: 'Pelanggan berhasil dihapus', key: 'del_pel' });
        } catch (error) {
            console.error("Error deleting:", error);
            message.error({ content: `Gagal: ${error.message}`, key: 'del_pel' });
        }
    }, []);

    const handleOpenHistory = useCallback((pelanggan) => {
        // Debugging: Cek ID yang dikirim
        console.log("Membuka history untuk:", pelanggan);
        setSelectedHistoryCustomer(pelanggan);
        setIsHistoryModalOpen(true);
    }, []);

    const handleCloseHistory = useCallback(() => {
        setIsHistoryModalOpen(false);
        setTimeout(() => setSelectedHistoryCustomer(null), 300);
    }, []);

    // --- COLUMNS ---
    const columns = useMemo(() => [
        {
            title: 'No.',
            key: 'index',
            width: 60,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
        },
        {
            title: 'Nama Pelanggan',
            dataIndex: 'nama',
            key: 'nama',
            sorter: (a, b) => (a.nama || '').localeCompare(b.nama || ''),
        },
        {
            title: 'Telepon',
            dataIndex: 'telepon',
            key: 'telepon',
            width: 150,
            render: (tel) => tel || '-',
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Lihat Riwayat Transaksi">
                        <Button
                            size="small"
                            type="default"
                            icon={<HistoryOutlined />}
                            onClick={() => handleOpenHistory(record)}
                            style={{ color: '#1890ff', borderColor: '#1890ff' }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Hapus pelanggan?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Hapus"
                        cancelText="Batal"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ], [pagination, handleDelete, handleOpenHistory]);

    return (
        <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
            <Content style={{ padding: '24px' }}>
                <Card 
                    title="Data Pelanggan" 
                    bordered={false}
                    extra={
                        <Button type="primary" icon={<UserAddOutlined />} onClick={handleOpenCreate}>
                            Tambah Pelanggan
                        </Button>
                    }
                    style={{ borderRadius: 8 }}
                >
                    <div style={{ marginBottom: 16, maxWidth: 400 }}>
                        <Search
                            placeholder="Cari nama atau telepon..."
                            onChange={handleSearchChange}
                            allowClear
                            enterButton
                        />
                    </div>

                    <Table
                        columns={columns}
                        dataSource={filteredPelanggan}
                        rowKey="id"
                        loading={loadingPelanggan}
                        pagination={pagination}
                        onChange={handleTableChange}
                        size="middle"
                        bordered
                        style={{ background: '#fff', borderRadius: 8 }}
                    />
                </Card>

                <PelangganForm
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    onSuccess={handleFormSuccess}
                    initialValues={editingPelanggan}
                />

                <CustomerHistoryModal
                    open={isHistoryModalOpen}
                    onCancel={handleCloseHistory}
                    customer={selectedHistoryCustomer}
                />
            </Content>
        </Layout>
    );
}