/**
 * Explain - This is a workaround to avoid the following error:
 * The ```@dnd-kit``` package is not correctly asserted by the lint tool.
 */

import type { UniqueIdentifier } from '@dnd-kit/core'
import {
  closestCenter,
  defaultDropAnimation,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import * as Portal from '@radix-ui/react-portal'
import { BlockNode } from '@root/renderer/components/_atoms/graphical-editor/ladder/block'
import { CoilNode } from '@root/renderer/components/_atoms/graphical-editor/ladder/coil'
import { ContactNode } from '@root/renderer/components/_atoms/graphical-editor/ladder/contact'
import { BlockVariant } from '@root/renderer/components/_atoms/graphical-editor/types/block'
import { CreateRung } from '@root/renderer/components/_molecules/graphical-editor/ladder/rung/create-rung'
import { Rung } from '@root/renderer/components/_organisms/graphical-editor/ladder/rung'
import { useOpenPLCStore } from '@root/renderer/store'
import { RungLadderState, zodLadderFlowSchema } from '@root/renderer/store/slices'
import { cn } from '@root/utils'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { v4 as uuidv4 } from 'uuid'

import BlockElement from '../elements/ladder/block'
import CoilElement from '../elements/ladder/coil'
import ContactElement from '../elements/ladder/contact'

export default function LadderEditor() {
  const {
    ladderFlows,
    editor,
    ladderFlowActions,
    searchNodePosition,
    projectActions: { updatePou },
    workspaceActions: { setEditingState },

    modals,
    modalActions: { closeModal },
  } = useOpenPLCStore()

  const flow = ladderFlows.find((flow) => flow.name === editor.meta.name)
  const rungs = flow?.rungs || []
  const flowUpdated = flow?.updated
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [activeItem, setActiveItem] = useState<RungLadderState | null>(null)

  const scrollableRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTo({
        top: searchNodePosition.y,
        left: searchNodePosition.x,
        behavior: 'smooth',
      })
    }
  }, [searchNodePosition])

  /**
   * Update the flow state to project JSON
   */
  useEffect(() => {
    if (!flowUpdated) return

    const flowSchema = zodLadderFlowSchema.safeParse(flow)
    if (!flowSchema.success) return

    updatePou({
      name: editor.meta.name,
      content: {
        language: 'ld',
        value: flowSchema.data,
      },
    })

    /**
     * TODO: Verify if this is method is declared
     */
    ladderFlowActions.setFlowUpdated({ editorName: editor.meta.name, updated: false })
    setEditingState('unsaved')
  }, [flowUpdated === true])

  const getRungPos = (rungId: UniqueIdentifier) => rungs.findIndex((rung) => rung.id === rungId)

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    setActiveId(active.id)
    setActiveItem(rungs.find((rung) => rung.id === active.id) || null)
  }

  const handleAddNewRung = () => {
    const defaultViewport: [number, number] = [300, 100]
    ladderFlowActions.startLadderRung({
      editorName: editor.meta.name,
      rungId: `rung_${editor.meta.name}_${uuidv4()}`,
      defaultBounds: defaultViewport,
      reactFlowViewport: defaultViewport,
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    setActiveId(null)
    setActiveItem(null)

    if (!flow) {
      console.error('Flow is undefined')
      return
    }

    if (!active || !over) {
      console.error('Active or over is undefined')
      return
    }

    if (active.id === over.id) return

    const sourceIndex = getRungPos(active.id)
    const destinationIndex = getRungPos(over.id)

    if (
      sourceIndex < 0 ||
      destinationIndex < 0 ||
      sourceIndex >= flow.rungs.length ||
      destinationIndex >= flow.rungs.length
    ) {
      console.error('Invalid source or destination index')
      return
    }

    const auxRungs = [...(flow?.rungs || [])]
    // Store the original state for recovery
    const originalRungs = [...auxRungs]
    const [removed] = auxRungs.splice(sourceIndex, 1)
    auxRungs.splice(destinationIndex, 0, removed)

    try {
      ladderFlowActions.setRungs({ editorName: editor.meta.name, rungs: auxRungs })
    } catch (error) {
      console.error('Failed to update rungs:', error)
      // Recover the original state
      ladderFlowActions.setRungs({ editorName: editor.meta.name, rungs: originalRungs })
      // Notify the user
      console.error('Failed to reorder rungs. The operation has been reverted.')
    }
  }

  /**
   * Handle the close of the modal
   */
  const handleModalClose = () => {
    closeModal()
  }

  return (
    <div className='h-full w-full overflow-y-auto' ref={scrollableRef} style={{ scrollbarGutter: 'stable' }}>
      <div className='flex flex-1 flex-col gap-4 px-2'>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
          <div
            className={cn({
              'h-fit rounded-lg border dark:border-neutral-800': rungs.length > 0,
            })}
          >
            <SortableContext items={rungs} strategy={verticalListSortingStrategy}>
              {rungs.map((rung, index) => (
                <Rung
                  key={rung.id}
                  id={rung.id}
                  index={index}
                  rung={rung}
                  className={cn({
                    'opacity-35': activeId === rung.id,
                  })}
                />
              ))}
            </SortableContext>
            {createPortal(
              <DragOverlay dropAnimation={defaultDropAnimation} modifiers={[restrictToParentElement]}>
                {activeId && activeItem ? (
                  <Rung key={activeItem.id} id={activeItem.id} rung={activeItem} index={-1} />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </div>
        </DndContext>
        <CreateRung onClick={handleAddNewRung} />
        <Portal.Root>
          {modals['block-ladder-element']?.open && (
            <BlockElement
              onClose={handleModalClose}
              selectedNode={modals['block-ladder-element'].data as BlockNode<BlockVariant>}
              isOpen={modals['block-ladder-element'].open}
            />
          )}
          {modals['contact-ladder-element']?.open && (
            <ContactElement
              onClose={handleModalClose}
              node={modals['contact-ladder-element'].data as ContactNode}
              isOpen={modals['contact-ladder-element'].open}
            />
          )}
          {modals['coil-ladder-element']?.open && (
            <CoilElement
              onClose={handleModalClose}
              node={modals['coil-ladder-element'].data as CoilNode}
              isOpen={modals['coil-ladder-element'].open}
            />
          )}
        </Portal.Root>
      </div>
    </div>
  )
}
