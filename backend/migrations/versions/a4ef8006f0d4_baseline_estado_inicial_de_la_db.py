"""baseline - estado inicial de la db

Revision ID: a4ef8006f0d4
Revises: 
Create Date: 2025-06-24 01:33:16.353659

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4ef8006f0d4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### INICIO DEL CÓDIGO CORREGIDO ###
    
    # Paso 1: Añadir la columna permitiendo que sea nula temporalmente.
    # Esto evita errores si la tabla 'suppliers' ya tiene datos.
    with op.batch_alter_table('suppliers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category_id', sa.Integer(), nullable=True))

    # Paso 2 (Opcional pero recomendado): Asignar una categoría por defecto a los proveedores existentes.
    # Si no tienes proveedores, puedes comentar o borrar esta línea.
    # ¡IMPORTANTE! Cambia el '1' por el ID de una categoría que realmente exista en tu tabla 'expense_categories'.
    op.execute('UPDATE suppliers SET category_id = 1 WHERE category_id IS NULL')

    # Paso 3: Ahora que todas las filas tienen un valor, hacemos que la columna sea NO NULABLE.
    with op.batch_alter_table('suppliers', schema=None) as batch_op:
        batch_op.alter_column('category_id',
                              existing_type=sa.INTEGER(),
                              nullable=False)

    # Paso 4: Crear el índice y la clave foránea, pero AHORA CON UN NOMBRE.
    with op.batch_alter_table('suppliers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_suppliers_category_id'), ['category_id'], unique=False)
        # Aquí está la corrección principal: le damos un nombre a la restricción.
        batch_op.create_foreign_key(
            "fk_suppliers_category_id_expense_categories", # <--- NOMBRE AÑADIDO
            'expense_categories', 
            ['category_id'], 
            ['id']
        )
        
    # No olvides también el cambio para la tabla representatives
    with op.batch_alter_table('representatives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('available_credit_ves', sa.Float(), nullable=False, server_default='0.0'))

    # ### FIN DEL CÓDIGO CORREGIDO ###


def downgrade() -> None:
    # ### INICIO DEL CÓDIGO CORREGIDO ###

    with op.batch_alter_table('representatives', schema=None) as batch_op:
        batch_op.drop_column('available_credit_ves')

    with op.batch_alter_table('suppliers', schema=None) as batch_op:
        # Para borrar la restricción, ahora usamos el nombre que le dimos.
        batch_op.drop_constraint("fk_suppliers_category_id_expense_categories", type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_suppliers_category_id'))
        batch_op.drop_column('category_id')

    # ### end Alembic commands ###
